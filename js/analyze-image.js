/**
 * analyze-image.js — 图片文件分析模块
 *
 * 主要检测项：
 *   1. EXIF 元数据泄露（相机型号、拍摄时间、GPS 位置等）
 *   2. 缩略图与主图不一致（打码后的照片，缩略图可能还是原图）
 *
 * 依赖：exifr（通过 CDN 或本地引入，全局变量为 exifr）
 *
 * 返回格式：
 * {
 *   exif: { ... },                // EXIF 信息
 *   gps: { lat, lng, hasGps },    // GPS 信息
 *   thumbnail: { ... },           // 缩略图检测结果
 *   error: null 或 错误信息
 * }
 */

/**
 * 分析一张图片，返回所有检测结果
 * @param {File|string} fileInput - 文件对象或图片 URL
 * @returns {Promise<Object>} - 检测结果
 *
 * 使用方式：
 *   const result = await analyzeImage(file);
 *   console.log(result.exif.camera);       // 相机型号
 *   console.log(result.gps.hasGps);        // 是否有 GPS
 *   console.log(result.thumbnail.isDiff);  // 缩略图是否不一致
 */
async function analyzeImage(fileInput) {
    const result = {
        exif: null,       // EXIF 元数据
        gps: null,        // GPS 位置信息
        thumbnail: null,  // 缩略图不一致检测结果
        error: null,      // 错误信息
    };

    // DoS 防护：图片最大尺寸（像素），防止超大图片占满内存
    const MAX_IMAGE_DIMENSION = 10000;

    try {
        // 获取 ArrayBuffer（exifr 需要二进制数据来解析 EXIF）
        let buffer;
        if (fileInput instanceof File) {
            buffer = await Utils.withTimeout(
                Utils.readFileAsArrayBuffer(fileInput),
                Utils.PARSE_TIMEOUTS.image,
                "图片读取超时"
            );
        } else if (typeof fileInput === "string") {
            // 如果传的是 URL，先 fetch 下来
            const resp = await fetch(fileInput);
            buffer = await resp.arrayBuffer();
        } else {
            buffer = fileInput;
        }

        // 同时解析 EXIF 信息和缩略图（带超时）
        // exifr.parse 可以一次性取出所有元数据
        const exifData = await Utils.withTimeout(
            exifr.parse(buffer, {
                // 让 exifr 返回缩略图的原始数据
                tiff: true,
                xmp: true,
                icc: false,
                iptc: true,
                thumbnail: true, // ← 关键：不开这个，exifr 默认不提取内嵌缩略图
            }),
            Utils.PARSE_TIMEOUTS.image,
            "EXIF 解析超时，可能是畸形图片"
        );

        // 提取 EXIF 基本信息
        result.exif = extractExifInfo(exifData);
        // 提取 GPS 信息
        result.gps = extractGpsInfo(exifData);

        // 检测缩略图与主图是否不一致
        // 需要同时拿到主图和缩略图来比对
        result.thumbnail = await checkThumbnailMismatch(fileInput, buffer, exifData, MAX_IMAGE_DIMENSION);

    } catch (err) {
        result.error = err.message || "图片解析失败";
    }

    return result;
}

// ============================================================
// 1. EXIF 基本信息提取
// ============================================================

/**
 * 从 exifr 返回的数据中提取我们关心的字段
 * @param {Object} exifData - exifr.parse 返回的原始数据
 * @returns {Object} - 整理后的 EXIF 信息
 */
function extractExifInfo(exifData) {
    const info = {
        hasExif: false,          // 是否有 EXIF 信息
        cameraMake: "",          // 相机品牌（如 Apple）
        cameraModel: "",         // 相机型号（如 iPhone 13）
        software: "",            // 处理软件（如 Photoshop）
        dateTimeOriginal: "",    // 拍摄时间
        imageDescription: "",    // 图片描述（可能包含敏感信息）
        artist: "",              // 作者/艺术家
        copyright: "",           // 版权信息
        hasSensitive: false,     // 是否有敏感元数据
    };

    // exifr 把字段平铺在对象里，直接取就行
    if (exifData) {
        // DoS/XSS 防护：所有字符串字段做长度截断
        const MAX_LEN = 200;
        info.cameraMake = Utils.truncate(exifData.Make || exifData.make || "", MAX_LEN);
        info.cameraModel = Utils.truncate(exifData.Model || exifData.model || "", MAX_LEN);
        info.software = Utils.truncate(exifData.Software || exifData.software || "", MAX_LEN);
        info.dateTimeOriginal = Utils.truncate(
            exifData.DateTimeOriginal || exifData.DateTime || exifData.dateTimeOriginal || "",
            MAX_LEN
        );
        info.imageDescription = Utils.truncate(
            exifData.ImageDescription || exifData.imageDescription || "",
            500
        );
        info.artist = Utils.truncate(exifData.Artist || exifData.artist || "", MAX_LEN);
        info.copyright = Utils.truncate(exifData.Copyright || exifData.copyright || "", MAX_LEN);

        // 判断是否有 EXIF（有相机型号或时间就算有）
        info.hasExif = !!(info.cameraModel || info.dateTimeOriginal || info.software);

        // 判断是否有敏感信息（作者、相机型号、描述都算）
        info.hasSensitive = !!(
            info.artist ||
            info.imageDescription ||
            (info.cameraMake && info.cameraModel)
        );
    }

    return info;
}

// ============================================================
// 2. GPS 信息提取
// ============================================================

/**
 * 从 exifr 数据中提取 GPS 位置
 * @param {Object} exifData - exifr.parse 返回的数据
 * @returns {Object} - GPS 信息 { lat, lng, hasGps, formatted }
 */
function extractGpsInfo(exifData) {
    const gps = {
        lat: 0,           // 纬度
        lng: 0,           // 经度
        hasGps: false,    // 是否有 GPS 信息
        formatted: "",    // 格式化后的坐标字符串
    };

    if (exifData && exifData.latitude !== undefined && exifData.longitude !== undefined) {
        // exifr 已经把 GPS 坐标解析成十进制度了，直接用
        gps.lat = exifData.latitude;
        gps.lng = exifData.longitude;
        gps.hasGps = true;
        // 保留 6 位小数格式化
        gps.formatted = gps.lat.toFixed(6) + ", " + gps.lng.toFixed(6);
    }
    // 也可能字段名不一样，兼容一下
    else if (exifData && exifData.GPSLatitude && exifData.GPSLongitude) {
        gps.lat = exifData.GPSLatitude;
        gps.lng = exifData.GPSLongitude;
        gps.hasGps = true;
        gps.formatted = gps.lat.toFixed(6) + ", " + gps.lng.toFixed(6);
    }

    return gps;
}

// ============================================================
// 3. 缩略图与主图不一致检测
// ============================================================

/**
 * 检测图片的嵌入缩略图是否和主图不一致
 * （比如照片打了马赛克，但 EXIF 里的缩略图还是原图）
 *
 * @param {File|string} fileInput - 图片文件
 * @param {ArrayBuffer} buffer - 图片二进制数据
 * @param {Object} exifData - EXIF 数据（含缩略图）
 * @returns {Promise<Object>} - 检测结果
 *
 * 原理：
 *   1. 把主图画到 Canvas A 上，缩到缩略图大小
 *   2. 把缩略图画到 Canvas B 上
 *   3. 逐像素比对两张图，计算差异比例
 *   4. 差异超过阈值 → 判定为不一致
 */
async function checkThumbnailMismatch(fileInput, buffer, exifData, maxDimension = 10000) {
    const result = {
        hasThumbnail: false,    // 是否有嵌入缩略图
        isDiff: false,          // 是否不一致
        diffPercent: 0,         // 差异百分比（0-100）
        confidence: "",         // 置信度："high" / "suspected" / "none"
        thumbnailWidth: 0,      // 缩略图宽度
        thumbnailHeight: 0,     // 缩略图高度
    };

    try {
        // ---- 第一步：获取缩略图 ----
        // 用 exifr.thumbnail(buffer) 直接提取内嵌缩略图字节。
        // 注意：不要用 exifr.parse(...) 返回的 thumbnail 字段（实测该字段拿不到），
        //       也不要用库对象 exifr.thumbnail（那永远是 undefined，就是当初的死代码）。
        let thumbnailDataUrl = null;
        try {
            if (typeof exifr.thumbnail === "function") {
                const thumb = await exifr.thumbnail(buffer); // 内嵌缩略图字节 or null
                if (thumb) {
                    thumbnailDataUrl = await blobToDataURL(
                        new Blob([thumb], { type: "image/jpeg" })
                    );
                }
            }
        } catch (err) {
            // 无缩略图或解析失败 → thumbnailDataUrl 保持 null
        }

        // 如果没拿到缩略图，说明没有嵌入缩略图，直接返回
        if (!thumbnailDataUrl) {
            return result;
        }

        result.hasThumbnail = true;

        // ---- 第二步：加载主图和缩略图 ----
        // 主图：如果是 File，转成 DataURL；否则直接用
        let mainImageUrl;
        if (fileInput instanceof File) {
            mainImageUrl = await blobToDataURL(fileInput);
        } else if (typeof fileInput === "string") {
            mainImageUrl = fileInput;
        } else {
            // 是 ArrayBuffer 的话，转成 blob 再转 DataURL
            const blob = new Blob([buffer], { type: "image/jpeg" });
            mainImageUrl = await blobToDataURL(blob);
        }

        // 加载两张图片
        const [mainImg, thumbImg] = await Promise.all([
            loadImage(mainImageUrl),
            loadImage(thumbnailDataUrl),
        ]);

        // DoS 防护：图片尺寸过大则跳过缩略图检测（避免 Canvas 占满内存）
        if (mainImg.naturalWidth > maxDimension || mainImg.naturalHeight > maxDimension) {
            console.warn(`[图片检测] 主图尺寸过大（${mainImg.naturalWidth}×${mainImg.naturalHeight}），跳过缩略图比对`);
            result.hasThumbnail = true; // 标记有缩略图，但不做比对
            result.thumbnailWidth = thumbImg.width;
            result.thumbnailHeight = thumbImg.height;
            return result;
        }

        // 记录缩略图尺寸
        result.thumbnailWidth = thumbImg.width;
        result.thumbnailHeight = thumbImg.height;

        // ---- 第三步：把主图缩到缩略图尺寸，然后逐像素比对 ----
        // 缩略图一般很小（比如 160x120），把主图缩成一样大再比
        const compareSize = Math.min(thumbImg.width, thumbImg.height, 100);
        const diffResult = compareImages(mainImg, thumbImg, compareSize);

        result.diffPercent = diffResult.percent;

        // ---- 第四步：判断结果 ----
        // 差异 < 5% → 基本一致
        if (diffResult.percent < 5) {
            result.isDiff = false;
            result.confidence = "none";
        }
        // 差异 5%-15% → 疑似（可能是压缩差异，也可能是真的不一样）
        else if (diffResult.percent < 15) {
            result.isDiff = false;
            result.confidence = "suspected";
        }
        // 差异 > 15% → 高度不一致
        else {
            result.isDiff = true;
            result.confidence = "high";
        }

    } catch (err) {
        // 缩略图检测失败不影响整体结果，保持默认值即可
    }

    return result;
}

/**
 * 把两张图画到 Canvas 上，缩放到相同尺寸，逐像素比较差异
 * @param {HTMLImageElement} img1 - 图片1（主图）
 * @param {HTMLImageElement} img2 - 图片2（缩略图）
 * @param {number} size - 比较用的尺寸（边长）
 * @returns {{ percent: number, diffPixels: number }} - 差异比例和差异像素数
 */
function compareImages(img1, img2, size) {
    // 创建两个 Canvas，尺寸相同
    const canvas1 = document.createElement("canvas");
    const canvas2 = document.createElement("canvas");
    canvas1.width = canvas2.width = size;
    canvas1.height = canvas2.height = size;

    const ctx1 = canvas1.getContext("2d");
    const ctx2 = canvas2.getContext("2d");

    // 把两张图都按"覆盖"方式画到正方形 Canvas 上（和手机缩略图行为一致）
    drawCover(ctx1, img1, size, size);
    drawCover(ctx2, img2, size, size);

    // 获取两张图的像素数据
    const data1 = ctx1.getImageData(0, 0, size, size).data;
    const data2 = ctx2.getImageData(0, 0, size, size).data;

    // 逐像素比较
    let diffPixels = 0;      // 差异像素数
    const totalPixels = size * size;  // 总像素数

    // data 是 RGBA 四个字节一组，所以 i += 4
    for (let i = 0; i < data1.length; i += 4) {
        // 计算两个像素的颜色差异（只看 RGB，不管 A）
        const rDiff = Math.abs(data1[i] - data2[i]);         // R 通道差
        const gDiff = Math.abs(data1[i + 1] - data2[i + 1]); // G 通道差
        const bDiff = Math.abs(data1[i + 2] - data2[i + 2]); // B 通道差

        // 平均差异 > 20 就算是不同的像素（阈值可以调）
        const avgDiff = (rDiff + gDiff + bDiff) / 3;
        if (avgDiff > 20) {
            diffPixels++;
        }
    }

    // 返回差异百分比
    return {
        percent: (diffPixels / totalPixels) * 100,
        diffPixels: diffPixels,
    };
}

/**
 * 以"覆盖"(cover) 方式把图片画到 Canvas 上
 * （类似 CSS 的 background-size: cover，图片填满容器，超出部分裁掉）
 * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
 * @param {HTMLImageElement} img - 图片
 * @param {number} w - 目标宽度
 * @param {number} h - 目标高度
 */
function drawCover(ctx, img, w, h) {
    // 计算图片宽高比
    const imgRatio = img.width / img.height;
    const targetRatio = w / h;

    let sx, sy, sw, sh; // 源图的裁剪区域

    if (imgRatio > targetRatio) {
        // 图片更宽 → 裁掉左右两边
        sh = img.height;
        sw = img.height * targetRatio;
        sx = (img.width - sw) / 2;
        sy = 0;
    } else {
        // 图片更高 → 裁掉上下两边
        sw = img.width;
        sh = img.width / targetRatio;
        sx = 0;
        sy = (img.height - sh) / 2;
    }

    // 画到 Canvas 上
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 加载一张图片，返回 Image 对象（Promise 包装）
 * @param {string} src - 图片地址或 dataURL
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        // 图片加载成功
        img.onload = () => resolve(img);
        // 图片加载失败
        img.onerror = () => reject(new Error("图片加载失败"));
        // 设置跨域（如果是网络图片的话）
        img.crossOrigin = "anonymous";
        img.src = src;
    });
}

/**
 * Blob 转 DataURL
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

// ============================================================
// 导出到全局
// ============================================================
window.analyzeImage = analyzeImage;
