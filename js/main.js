/**
 * main.js — 主入口：页面逻辑 + 事件绑定 + 串联所有检测模块
 *
 * 页面三个状态：
 *   1. 上传页（#page-upload）—— 拖文件或选择文件
 *   2. 分析中（#page-loading）—— 进度条
 *   3. 结果页（#page-result）—— 展示检测结果
 *
 * 数据流：
 *   文件拖入 → 显示分析中 → 调用对应分析函数 → 计算风险分 → 渲染结果
 */

// 全局变量：当前分析的文件和结果
let currentFile = null;       // 当前文件
let currentResult = null;     // 当前分析结果
let currentBatchData = [];    // 当前批量检测的文件数据数组

// ============================================================
// 页面初始化
// ============================================================

// 页面加载完成后执行初始化
document.addEventListener("DOMContentLoaded", init);

/**
 * 初始化函数：绑定所有事件
 */
function init() {
    setupDragAndDrop();   // 设置拖拽上传
    setupFileInput();     // 设置点击选择文件
    setupCleanButton();   // 设置一键清洗按钮
    setupReuploadButton();// 设置重新上传按钮
}

// ============================================================
// 1. 拖拽上传
// ============================================================

/**
 * 设置拖拽上传区域的事件
 */
function setupDragAndDrop() {
    // 拖拽区域元素
    const dropZone = Utils.$("#drop-zone");
    if (!dropZone) return;

    // 拖拽进入区域时，添加高亮样式
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();  // 必须阻止默认行为，否则不会触发 drop
        dropZone.classList.add("dragover");
    });

    // 拖拽离开区域时，移除高亮样式
    dropZone.addEventListener("dragleave", (e) => {
        e.preventDefault();
        // 只有离开整个区域时才移除（避免在子元素间跳来跳去）
        if (!dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove("dragover");
        }
    });

    // 松开鼠标（放下文件）时，处理文件
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");

        // 支持多文件批量检测
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleMultipleFiles(Array.from(files));
        }
    });
}

// ============================================================
// 2. 点击选择文件
// ============================================================

/**
 * 设置点击选择文件的 input
 */
function setupFileInput() {
    const fileInput = Utils.$("#file-input");
    const browseBtn = document.querySelector(".browse-btn");
    if (!fileInput) return;

    // 点击浏览按钮时，触发 input 的点击（打开文件选择框）
    if (browseBtn) {
        browseBtn.addEventListener("click", (e) => {
            e.preventDefault();
            fileInput.click();
        });
    }

    // 用户选择文件后
    fileInput.addEventListener("change", (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            handleMultipleFiles(Array.from(files));
        }
        // 清空 input，这样下次选同一个文件也会触发 change
        fileInput.value = "";
    });
}

// ============================================================
// 3. 文件处理主流程
// ============================================================

/**
 * 处理用户上传的文件：分析 → 评分 → 显示结果
 * @param {File} file - 用户上传的文件
 */
async function handleFile(file) {
    // 保存当前文件
    currentFile = file;

    // 前置安检：类型 + 大小 + 空文件
    const guard = Utils.guardFile(file);
    if (!guard.pass) {
        alert(guard.reason);
        return;
    }

    // 切换到"分析中"页面
    showLoadingPage(file);

    try {
        // 根据文件类型调用对应的分析函数
        let result = { fileType, fileName: file.name, fileSize: file.size };

        if (fileType === "docx") {
            result.docx = await analyzeDocx(file);
        } else if (fileType === "xlsx") {
            result.xlsx = await analyzeXlsx(file);
        } else if (fileType === "pptx") {
            result.pptx = await analyzePptx(file);
        } else if (fileType === "doc") {
            result.doc = await analyzeDoc(file);
        } else if (fileType === "image") {
            result.image = await analyzeImage(file);
        } else if (fileType === "pdf") {
            result.pdf = await analyzePdf(file);
        }

        // 计算风险评分
        result.risk = calculateRisk(result);

        // 保存结果
        currentResult = result;

        // 渲染结果页面
        renderResult(result);

        // 切换到结果页
        showResultPage();

    } catch (err) {
        alert("分析失败：" + err.message);
        showUploadPage();
    }
}

// ============================================================
// 4. 页面切换
// ============================================================

/** 显示上传页 */
function showUploadPage() {
    Utils.$("#page-upload").style.display = "flex";
    Utils.$("#page-loading").style.display = "none";
    Utils.$("#page-result").style.display = "none";
}

/** 显示分析中页面 */
function showLoadingPage(file) {
    Utils.$("#page-upload").style.display = "none";
    Utils.$("#page-loading").style.display = "flex";
    Utils.$("#page-result").style.display = "none";

    // 显示文件名和大小
    Utils.$("#loading-filename").textContent = file.name;
    Utils.$("#loading-filesize").textContent = Utils.formatBytes(file.size);
}

/** 显示结果页 */
function showResultPage() {
    Utils.$("#page-upload").style.display = "none";
    Utils.$("#page-loading").style.display = "none";
    Utils.$("#page-result").style.display = "block";
}

// ============================================================
// 5. 结果渲染
// ============================================================

/**
 * 渲染检测结果到页面上
 * @param {Object} result - 分析结果
 */
function renderResult(result) {
    const { risk, fileType, fileName, fileSize } = result;

    // ---- 文件基本信息 ----
    Utils.$("#result-filename").textContent = fileName;
    Utils.$("#result-filesize").textContent = Utils.formatBytes(fileSize);
    Utils.$("#result-filetype").textContent = fileType.toUpperCase();

    // ---- 风险分数和等级 ----
    const scoreEl = Utils.$("#risk-score");
    const levelEl = Utils.$("#risk-level");
    const ringEl = Utils.$("#risk-ring");

    // 设置分数
    scoreEl.textContent = risk.score;

    // 根据等级设置文字和颜色
    if (risk.level === "high") {
        levelEl.textContent = "高风险";
        ringEl.className = "risk-ring high";
    } else if (risk.level === "medium") {
        levelEl.textContent = "中等风险";
        ringEl.className = "risk-ring medium";
    } else {
        levelEl.textContent = "安全";
        ringEl.className = "risk-ring safe";
    }

    // ---- 风险原因列表 ----
    const reasonsEl = Utils.$("#risk-reasons");
    reasonsEl.innerHTML = "";  // 清空旧内容

    for (const reason of risk.reasons) {
        const li = Utils.createEl("li", { class: "reason-item" }, reason);
        reasonsEl.appendChild(li);
    }

    // ---- 详细检测结果 ----
    const detailsEl = Utils.$("#detail-sections");
    detailsEl.innerHTML = "";  // 清空

    // DOCX 详情
    if (result.docx && !result.docx.error) {
        detailsEl.appendChild(renderDocxDetail(result.docx));
    }

    // 图片详情
    if (result.image && !result.image.error) {
        detailsEl.appendChild(renderImageDetail(result.image));
    }

    // PDF 详情
    if (result.pdf && !result.pdf.error) {
        detailsEl.appendChild(renderPdfDetail(result.pdf));
    } else if (result.pdf && result.pdf.error) {
        // PDF 检测失败，显示错误信息
        const errCard = Utils.createEl("div", { class: "detail-card" });
        errCard.appendChild(Utils.createEl("h3", {}, "PDF 检测详情"));
        const errBox = Utils.createEl("div", { class: "danger-box" });
        errBox.appendChild(Utils.createEl("div", { class: "danger-title" }, "❌ PDF 解析失败"));
        errBox.appendChild(Utils.createEl("div", {}, result.pdf.error));
        errCard.appendChild(errBox);
        detailsEl.appendChild(errCard);
    }
}

/**
 * 渲染 DOCX 检测详情卡片
 */
function renderDocxDetail(docxResult) {
    const { metadata, revisions, comments, hiddenText } = docxResult;

    // 用 createEl 创建 DOM 结构
    const card = Utils.createEl("div", { class: "detail-card" });

    // 标题
    card.appendChild(Utils.createEl("h3", { class: "detail-title" }, "📄 文档检测详情"));

    // 元数据部分
    const metaSection = Utils.createEl("div", { class: "detail-section" });
    metaSection.appendChild(Utils.createEl("h4", {}, "元数据"));
    const metaList = Utils.createEl("ul", { class: "detail-list" });

    if (metadata.author) {
        metaList.appendChild(Utils.createEl("li", {},
            `作者：${Utils.escapeHtml(metadata.author)}`
        ));
    }
    if (metadata.lastModifiedBy) {
        metaList.appendChild(Utils.createEl("li", {},
            `最后修改者：${Utils.escapeHtml(metadata.lastModifiedBy)}`
        ));
    }
    if (metadata.created) {
        metaList.appendChild(Utils.createEl("li", {},
            `创建时间：${Utils.formatDate(metadata.created)}`
        ));
    }
    if (metadata.modified) {
        metaList.appendChild(Utils.createEl("li", {},
            `修改时间：${Utils.formatDate(metadata.modified)}`
        ));
    }
    if (!metadata.author && !metadata.lastModifiedBy) {
        metaList.appendChild(Utils.createEl("li", { class: "safe-text" }, "未检测到敏感元数据"));
    }
    metaSection.appendChild(metaList);
    card.appendChild(metaSection);

    // 修订记录部分
    const revSection = Utils.createEl("div", { class: "detail-section" });
    revSection.appendChild(Utils.createEl("h4", {},
        `修订记录（${revisions.count} 处）`
    ));

    if (revisions.hasRevisions) {
        // 删除记录（最敏感）
        if (revisions.deletions.length > 0) {
            const delBox = Utils.createEl("div", { class: "danger-box" });
            delBox.appendChild(Utils.createEl("div", { class: "danger-title" },
                `⚠️ ${revisions.deletions.length} 处删除记录（内容仍可恢复）`
            ));
            const delList = Utils.createEl("ul", { class: "revision-list" });
            revisions.deletions.slice(0, 5).forEach(d => {
                delList.appendChild(Utils.createEl("li", {},
                    `[${Utils.escapeHtml(d.author)}] ${Utils.escapeHtml(d.text || "(空)")}`
                ));
            });
            if (revisions.deletions.length > 5) {
                delList.appendChild(Utils.createEl("li", { class: "more-text" },
                    `... 还有 ${revisions.deletions.length - 5} 处`
                ));
            }
            delBox.appendChild(delList);
            revSection.appendChild(delBox);
        }

        // 插入记录
        if (revisions.insertions.length > 0) {
            const insInfo = Utils.createEl("div", { class: "info-text" },
                `插入记录 ${revisions.insertions.length} 处`
            );
            revSection.appendChild(insInfo);
        }
    } else {
        revSection.appendChild(Utils.createEl("div", { class: "safe-text" }, "未检测到修订记录"));
    }
    card.appendChild(revSection);

    // 批注部分
    const commSection = Utils.createEl("div", { class: "detail-section" });
    commSection.appendChild(Utils.createEl("h4", {},
        `批注（${comments.count} 条）`
    ));

    if (comments.hasComments) {
        const commList = Utils.createEl("ul", { class: "comment-list" });
        comments.items.slice(0, 5).forEach(c => {
            commList.appendChild(Utils.createEl("li", {},
                `[${Utils.escapeHtml(c.author)}] ${Utils.escapeHtml(c.text)}`
            ));
        });
        if (comments.items.length > 5) {
            commList.appendChild(Utils.createEl("li", { class: "more-text" },
                `... 还有 ${comments.items.length - 5} 条`
            ));
        }
        commSection.appendChild(commList);
    } else {
        commSection.appendChild(Utils.createEl("div", { class: "safe-text" }, "未检测到批注"));
    }
    card.appendChild(commSection);

    // 隐藏文字部分
    if (hiddenText) {
        const htSection = Utils.createEl("div", { class: "detail-section" });
        htSection.appendChild(Utils.createEl("h4", {},
            `隐藏文字（${hiddenText.count || 0} 处）`
        ));

        if (hiddenText.hasHiddenText) {
            const htBox = Utils.createEl("div", { class: "danger-box" });

            // 分类统计
            let typeDesc = [];
            if (hiddenText.sameColorCount > 0) typeDesc.push(`同色背景 ${hiddenText.sameColorCount} 处`);
            if (hiddenText.vanishCount > 0) typeDesc.push(`隐藏格式 ${hiddenText.vanishCount} 处`);
            if (hiddenText.tinyFontCount > 0) typeDesc.push(`极小字号 ${hiddenText.tinyFontCount} 处`);

            htBox.appendChild(Utils.createEl("div", { class: "danger-title" },
                `⚠️ 检测到 ${hiddenText.count} 处隐藏文字`
            ));
            htBox.appendChild(Utils.createEl("div", {},
                `${typeDesc.join("、")}，肉眼不可见但仍可复制提取`
            ));

            // 列出前 5 条内容预览
            if (hiddenText.items && hiddenText.items.length > 0) {
                const htList = Utils.createEl("ul", { class: "comment-list" });
                hiddenText.items.slice(0, 5).forEach(item => {
                    const typeLabel = item.type === "same_color" ? "同色背景"
                        : item.type === "vanish" ? "隐藏格式"
                            : "极小字号";
                    htList.appendChild(Utils.createEl("li", {},
                        `[${typeLabel}] ${Utils.escapeHtml(item.text)}`
                    ));
                });
                if (hiddenText.items.length > 5) {
                    htList.appendChild(Utils.createEl("li", { class: "more-text" },
                        `... 还有 ${hiddenText.items.length - 5} 处`
                    ));
                }
                htBox.appendChild(htList);
            }

            htSection.appendChild(htBox);
        } else {
            htSection.appendChild(Utils.createEl("div", { class: "safe-text" }, "未检测到隐藏文字"));
        }
        card.appendChild(htSection);
    }

    return card;
}

/**
 * 渲染图片检测详情卡片
 */
function renderImageDetail(imgResult) {
    const { exif, gps, thumbnail, pii } = imgResult;

    const card = Utils.createEl("div", { class: "detail-card" });
    card.appendChild(Utils.createEl("h3", { class: "detail-title" }, "🖼️ 图片检测详情"));

    // EXIF 信息
    const exifSection = Utils.createEl("div", { class: "detail-section" });
    exifSection.appendChild(Utils.createEl("h4", {}, "EXIF 元数据"));
    const exifList = Utils.createEl("ul", { class: "detail-list" });

    if (exif.cameraModel) {
        exifList.appendChild(Utils.createEl("li", {},
            `设备：${Utils.escapeHtml(exif.cameraMake + " " + exif.cameraModel)}`
        ));
    }
    if (exif.dateTimeOriginal) {
        exifList.appendChild(Utils.createEl("li", {},
            `拍摄时间：${Utils.formatDate(exif.dateTimeOriginal)}`
        ));
    }
    if (exif.software) {
        exifList.appendChild(Utils.createEl("li", {},
            `处理软件：${Utils.escapeHtml(exif.software)}`
        ));
    }
    if (!exif.hasExif) {
        exifList.appendChild(Utils.createEl("li", { class: "safe-text" }, "未检测到 EXIF 信息"));
    }
    exifSection.appendChild(exifList);
    card.appendChild(exifSection);

    // GPS 信息
    const gpsSection = Utils.createEl("div", { class: "detail-section" });
    gpsSection.appendChild(Utils.createEl("h4", {}, "GPS 位置"));

    if (gps.hasGps) {
        const gpsBox = Utils.createEl("div", { class: "danger-box" });
        gpsBox.appendChild(Utils.createEl("div", { class: "danger-title" },
            `⚠️ 检测到 GPS 位置信息`
        ));
        gpsBox.appendChild(Utils.createEl("div", { class: "gps-coord" },
            `坐标：${gps.formatted}`
        ));
        gpsSection.appendChild(gpsBox);
    } else {
        gpsSection.appendChild(Utils.createEl("div", { class: "safe-text" }, "未检测到 GPS 信息"));
    }
    card.appendChild(gpsSection);

    // 缩略图检测
    const thumbSection = Utils.createEl("div", { class: "detail-section" });
    thumbSection.appendChild(Utils.createEl("h4", {}, "缩略图检测"));

    if (!thumbnail.hasThumbnail) {
        thumbSection.appendChild(Utils.createEl("div", { class: "safe-text" }, "未检测到嵌入缩略图"));
    } else if (thumbnail.isDiff) {
        const thumbBox = Utils.createEl("div", { class: "danger-box" });
        thumbBox.appendChild(Utils.createEl("div", { class: "danger-title" },
            `⚠️ 缩略图与主图不一致（差异 ${thumbnail.diffPercent.toFixed(1)}%）`
        ));
        thumbBox.appendChild(Utils.createEl("div", {},
            `缩略图尺寸：${thumbnail.thumbnailWidth} × ${thumbnail.thumbnailHeight}`
        ));
        thumbSection.appendChild(thumbBox);
    } else if (thumbnail.confidence === "suspected") {
        thumbSection.appendChild(Utils.createEl("div", { class: "warning-text" },
            `缩略图疑似不一致（差异 ${thumbnail.diffPercent.toFixed(1)}%）`
        ));
    } else {
        thumbSection.appendChild(Utils.createEl("div", { class: "safe-text" },
            `缩略图与主图一致（差异 ${thumbnail.diffPercent.toFixed(1)}%）`
        ));
    }
    card.appendChild(thumbSection);

    // 图片内容个人信息（PII）检测
    const piiSection = Utils.createEl("div", { class: "detail-section" });
    piiSection.appendChild(Utils.createEl("h4", {}, "🔍 图片内容个人信息识别"));

    if (!pii || pii.error) {
        // OCR 不可用或出错
        piiSection.appendChild(Utils.createEl("div", { class: "safe-text" },
            pii && pii.error ? `文字识别未启用：${pii.error}` : "未进行图片内容识别"
        ));
    } else if (!pii.hasPii || pii.items.length === 0) {
        if (pii.ocrAvailable) {
            piiSection.appendChild(Utils.createEl("div", { class: "safe-text" },
                "已扫描图片内容，未检测到身份证号、手机号、姓名、地址等个人信息"
            ));
        } else {
            piiSection.appendChild(Utils.createEl("div", { class: "warning-text" },
                "图片中未识别出可读取的文字内容"
            ));
        }
    } else {
        // 检测到个人信息，显示按类别选择的界面
        const piiBox = Utils.createEl("div", { class: "danger-box" });

        piiBox.appendChild(Utils.createEl("div", { class: "danger-title" },
            `⚠️ 检测到图片中的个人信息`
        ));
        piiBox.appendChild(Utils.createEl("div", {
            style: "margin-bottom: 12px; font-size: 13px; color: #666; line-height: 1.5;",
        }, "图片中识别到以下类型的个人信息。请勾选您需要清洗（打码覆盖）的类别："));

        // ===== 按类别分组 =====
        const typeGroups = {};
        pii.items.forEach((item, index) => {
            if (!typeGroups[item.type]) {
                typeGroups[item.type] = {
                    type: item.type,
                    typeLabel: item.typeLabel,
                    count: 0,
                    items: [],
                    indices: [],
                };
            }
            typeGroups[item.type].count++;
            typeGroups[item.type].items.push(item);
            typeGroups[item.type].indices.push(index);
        });

        // 类别显示顺序（按敏感程度排序）
        const typeOrder = ["id_card", "name", "birth_date", "gender", "ethnic", "address", "phone"];
        const sortedTypes = Object.keys(typeGroups).sort((a, b) => {
            const ia = typeOrder.indexOf(a);
            const ib = typeOrder.indexOf(b);
            if (ia === -1 && ib === -1) return 0;
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });

        // 类别选择列表
        const typeList = Utils.createEl("div", {
            class: "pii-type-list",
            id: "pii-type-list",
            style: `
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-bottom: 12px;
            `,
        });

        sortedTypes.forEach(type => {
            const group = typeGroups[type];
            const typeEl = Utils.createEl("label", {
                class: "pii-type-item",
                style: `
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px 12px;
                    background: #fff;
                    border: 1px solid #e8e8e8;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                `,
            });

            // 类别复选框
            const typeCheckbox = Utils.createEl("input", {
                type: "checkbox",
                class: "pii-type-checkbox",
                "data-pii-type": type,
                checked: true,  // 默认全选
            });
            typeEl.appendChild(typeCheckbox);

            // 类型标签 + 数量
            const typeBadge = Utils.createEl("span", {
                class: `pii-type-badge pii-type-${type}`,
                style: "min-width: 70px; text-align: center;",
            }, group.typeLabel);
            typeEl.appendChild(typeBadge);

            // 数量标记
            const countBadge = Utils.createEl("span", {
                style: `
                    font-size: 12px;
                    color: #999;
                    background: #f5f5f5;
                    padding: 2px 8px;
                    border-radius: 10px;
                `,
            }, `${group.count} 处`);
            typeEl.appendChild(countBadge);

            // 示例值（第一个）
            const sampleValue = Utils.createEl("span", {
                style: `
                    font-size: 13px;
                    color: #555;
                    margin-left: auto;
                    max-width: 180px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                `,
                title: group.items[0].rawValue,
            }, `如：${Utils.escapeHtml(group.items[0].value)}`);
            typeEl.appendChild(sampleValue);

            // 悬停效果
            typeEl.addEventListener("mouseenter", () => {
                typeEl.style.borderColor = "#1890ff";
                typeEl.style.background = "#f0f7ff";
            });
            typeEl.addEventListener("mouseleave", () => {
                if (!typeCheckbox.checked) {
                    typeEl.style.borderColor = "#e8e8e8";
                    typeEl.style.background = "#fff";
                } else {
                    typeEl.style.borderColor = "#e8e8e8";
                    typeEl.style.background = "#fff";
                }
            });

            typeList.appendChild(typeEl);
        });
        piiBox.appendChild(typeList);

        // 全选/取消全选按钮
        const selectAllRow = Utils.createEl("div", {
            style: "display: flex; justify-content: space-between; align-items: center;",
        });
        const selectAllBtn = Utils.createEl("button", {
            class: "btn btn-ghost pii-select-all-btn",
            id: "pii-select-all-btn",
            style: "padding: 4px 10px; font-size: 12px;",
        }, "取消全选");
        selectAllBtn.addEventListener("click", (e) => {
            e.preventDefault();
            const checkboxes = document.querySelectorAll(".pii-type-checkbox");
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            checkboxes.forEach(cb => { cb.checked = !allChecked; });
            selectAllBtn.textContent = allChecked ? "全选" : "取消全选";
        });
        selectAllRow.appendChild(selectAllBtn);

        // 提示文字
        const hintText = Utils.createEl("span", {
            style: "font-size: 12px; color: #999;",
        }, "勾选的类别将在清洗时被黑色打码覆盖");
        selectAllRow.appendChild(hintText);

        piiBox.appendChild(selectAllRow);

        piiSection.appendChild(piiBox);
    }
    card.appendChild(piiSection);

    return card;
}

/**
 * 渲染 PDF 检测详情卡片
 */
function renderPdfDetail(pdfResult) {
    const { metadata, incremental, fakeRedaction, annotations } = pdfResult;

    const card = Utils.createEl("div", { class: "detail-card" });
    card.appendChild(Utils.createEl("h3", { class: "detail-title" }, "📕 PDF 检测详情"));

    // 元数据
    const metaSection = Utils.createEl("div", { class: "detail-section" });
    metaSection.appendChild(Utils.createEl("h4", {}, "元数据"));
    const metaList = Utils.createEl("ul", { class: "detail-list" });

    if (metadata.author) {
        metaList.appendChild(Utils.createEl("li", {}, `作者：${Utils.escapeHtml(metadata.author)}`));
    }
    if (metadata.creator) {
        metaList.appendChild(Utils.createEl("li", {}, `创建工具：${Utils.escapeHtml(metadata.creator)}`));
    }
    if (metadata.producer) {
        metaList.appendChild(Utils.createEl("li", {}, `PDF 生成器：${Utils.escapeHtml(metadata.producer)}`));
    }
    if (!metadata.author && !metadata.creator) {
        metaList.appendChild(Utils.createEl("li", { class: "safe-text" }, "未检测到敏感元数据"));
    }
    metaSection.appendChild(metaList);
    card.appendChild(metaSection);

    // 增量保存
    const incSection = Utils.createEl("div", { class: "detail-section" });
    incSection.appendChild(Utils.createEl("h4", {}, "增量版本检测"));

    if (incremental.hasIncremental) {
        const incBox = Utils.createEl("div", { class: "warning-box" });
        incBox.appendChild(Utils.createEl("div", { class: "warning-title" },
            `⚡ 检测到 ${incremental.versionCount} 个历史版本`
        ));
        incBox.appendChild(Utils.createEl("div", {},
            `估计残留体积约 ${Utils.formatBytes(incremental.estimatedResidueSize)}，可能包含已删除内容`
        ));
        incSection.appendChild(incBox);
    } else {
        incSection.appendChild(Utils.createEl("div", { class: "safe-text" }, "未检测到增量保存版本"));
    }
    card.appendChild(incSection);

    // 隐形文字检测（含黑框遮挡 + 同色隐藏）
    const fakeSection = Utils.createEl("div", { class: "detail-section" });
    fakeSection.appendChild(Utils.createEl("h4", {}, "隐形文字检测"));

    if (fakeRedaction.hasFakeRedaction) {
        const fakeBox = Utils.createEl("div", { class: "danger-box" });

        // 统计两种类型各有多少
        let darkCoverCount = 0;   // 黑框遮挡数
        let sameColorCount = 0;  // 同色隐藏数
        for (const pageItem of fakeRedaction.items) {
            for (const detail of pageItem.details) {
                if (detail.reason === "dark_cover") darkCoverCount += detail.textCount || 1;
                if (detail.reason === "same_color") sameColorCount += detail.textCount || 1;
            }
        }

        // 组装描述文案
        let descParts = [];
        if (darkCoverCount > 0) {
            descParts.push(`黑框遮挡 ${darkCoverCount} 处`);
        }
        if (sameColorCount > 0) {
            descParts.push(`同色隐藏 ${sameColorCount} 处`);
        }

        fakeBox.appendChild(Utils.createEl("div", { class: "danger-title" },
            `⚠️ 检测到 ${fakeRedaction.count} 处隐形文字`
        ));
        fakeBox.appendChild(Utils.createEl("div", {},
            `${descParts.join("、")}，文字层仍可复制提取`
        ));
        fakeSection.appendChild(fakeBox);
    } else {
        fakeSection.appendChild(Utils.createEl("div", { class: "safe-text" }, "未检测到隐形文字"));
    }
    card.appendChild(fakeSection);

    // 批注/注释
    const annSection = Utils.createEl("div", { class: "detail-section" });
    annSection.appendChild(Utils.createEl("h4", {},
        `批注/注释（${annotations.count} 条）`
    ));

    if (annotations.hasAnnotations) {
        const annList = Utils.createEl("ul", { class: "comment-list" });
        annotations.items.slice(0, 8).forEach(a => {
            const who = a.author ? `[${Utils.escapeHtml(a.author)}] ` : "";
            annList.appendChild(Utils.createEl("li", {},
                `${who}${Utils.escapeHtml(a.content)}（${a.type}）`
            ));
        });
        if (annotations.items.length > 8) {
            annList.appendChild(Utils.createEl("li", { class: "more-text" },
                `... 还有 ${annotations.items.length - 8} 条`
            ));
        }
        annSection.appendChild(annList);
    } else {
        annSection.appendChild(Utils.createEl("div", { class: "safe-text" }, "未检测到批注/注释"));
    }
    card.appendChild(annSection);

    return card;
}

// ============================================================
// 6. 一键清洗
// ============================================================

/**
 * 设置一键清洗按钮
 */
function setupCleanButton() {
    const btn = Utils.$("#clean-btn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        if (!currentFile) return;

        btn.disabled = true;
        btn.textContent = "清洗中...";

        try {
            // 获取用户勾选的 PII 项（仅图片类型有效）
            const selectedPiiItems = getSelectedPiiItems();

            const sanitizeOptions = {};
            if (selectedPiiItems && selectedPiiItems.length > 0) {
                sanitizeOptions.piiItems = selectedPiiItems;
            }

            const result = await sanitizeFile(currentFile, currentResult, sanitizeOptions);
            if (result.cleaned) {
                // 下载清洗后的文件
                downloadBlob(result.blob, result.filename);
                btn.textContent = "已下载清洗文件";
                setTimeout(() => {
                    btn.textContent = "一键清洗并下载";
                    btn.disabled = false;
                }, 2000);
            } else {
                alert("清洗失败：" + result.error);
                btn.textContent = "一键清洗并下载";
                btn.disabled = false;
            }
        } catch (err) {
            alert("清洗失败：" + err.message);
            btn.textContent = "一键清洗并下载";
            btn.disabled = false;
        }
    });
}

/**
 * 获取用户勾选的 PII 项（按类别读取，返回该类别下的所有 PII 项）
 * @returns {Array<Object>|null} 选中的 PII 项数组
 */
function getSelectedPiiItems() {
    if (!currentResult || !currentResult.image || !currentResult.image.pii) {
        return null;
    }
    const pii = currentResult.image.pii;
    if (!pii.hasPii || !pii.items || pii.items.length === 0) {
        return null;
    }

    // 读取类别复选框
    const checkboxes = document.querySelectorAll(".pii-type-checkbox:checked");
    const selectedTypes = new Set();
    checkboxes.forEach(cb => {
        const type = cb.getAttribute("data-pii-type");
        if (type) selectedTypes.add(type);
    });

    if (selectedTypes.size === 0) return null;

    // 返回所有选中类别下的 PII 项
    const selected = pii.items.filter(item => selectedTypes.has(item.type));
    return selected.length > 0 ? selected : null;
}

/**
 * 设置重新上传按钮
 */
function setupReuploadButton() {
    const btn = Utils.$("#reupload-btn");
    if (!btn) return;

    btn.addEventListener("click", () => {
        currentFile = null;
        currentResult = null;
        showUploadPage();
    });
}

// ============================================================
// 7. 批量文件检测
// ============================================================

/**
 * 处理多文件批量检测
 * @param {File[]} files
 */
async function handleMultipleFiles(files) {
    // 清空数组（保持同一引用，让 window.currentBatchData 也能看到）
    currentBatchData.length = 0;
    const container = Utils.$("#batch-results-container");
    const cardsList = Utils.$("#file-cards-list");
    const fileCountSpan = Utils.$("#file-count");

    if (!container || !cardsList) return;

    // ---- 前置安检：批量校验（总大小 + 逐个检查） ----
    const batchGuard = Utils.guardBatchFiles(files);
    if (!batchGuard.pass) {
        alert(batchGuard.reason);
        return;
    }
    const validFiles = batchGuard.validFiles;

    cardsList.innerHTML = ""; // 清空上一轮结果
    container.style.display = "block";
    fileCountSpan.textContent = validFiles.length;

    // 使用 Promise.all 实现多文件并行扫描解析
    const analysisPromises = validFiles.map(async (file, index) => {
        // 渲染初始 Loading 占位卡片
        const cardId = `file-card-${index}`;
        renderPlaceholderCard(cardId, file.name);

        try {
            // DoS 防护：单文件大小检查（二次确认，双重保障）
            const guard = Utils.guardFile(file);
            if (!guard.pass) {
                throw new Error(guard.reason);
            }

            const fileType = Utils.getFileType(file);
            if (fileType === "unknown") {
                throw new Error("不支持的文件格式");
            }

            // 根据类型分发检测器，组装统一格式的 result 对象
            let result = { fileType, fileName: file.name, fileSize: file.size };

            if (fileType === "docx") {
                result.docx = await analyzeDocx(file);
            } else if (fileType === "xlsx") {
                result.xlsx = await analyzeXlsx(file);
            } else if (fileType === "pptx") {
                result.pptx = await analyzePptx(file);
            } else if (fileType === "doc") {
                result.doc = await analyzeDoc(file);
            } else if (fileType === "image") {
                result.image = await analyzeImage(file);
            } else if (fileType === "pdf") {
                result.pdf = await analyzePdf(file);
            }

            // 计算风险评分
            result.risk = calculateRisk(result);

            const fileData = {
                id: cardId,
                file: file,
                result: result,
                riskInfo: result.risk
            };

            currentBatchData.push(fileData);

            // 更新该文件的卡片 UI
            updateFileCardUI(fileData);

        } catch (err) {
            console.error(`文件 ${file.name} 解析失败:`, err);
            updateCardError(cardId, file.name, err.message);
        }
    });

    await Promise.all(analysisPromises);
}

/**
 * 渲染单个文件的加载占位卡片
 */
function renderPlaceholderCard(cardId, fileName) {
    const cardsList = Utils.$("#file-cards-list");
    if (!cardsList) return;
    const cardHtml = `
        <div class="file-card" id="${cardId}">
            <div class="file-card-header">
                <span class="file-name">${Utils.escapeHtml(fileName)}</span>
                <span class="status-badge status-loading">正在检测...</span>
            </div>
            <div class="file-card-body">读取分析中，请稍候...</div>
        </div>
    `;
    cardsList.insertAdjacentHTML("beforeend", cardHtml);
}

/**
 * 更新完成检测后的卡片内容
 */
function updateFileCardUI(fileData) {
    const card = Utils.$(`#${fileData.id}`);
    if (!card) return;

    const risk = fileData.riskInfo; // { score, level, reasons }
    const riskScore = risk.score;
    const level = risk.level;

    let badgeClass = "status-safe";
    let levelText = "安全";
    if (level === "high") {
        badgeClass = "status-danger";
        levelText = "高风险";
    } else if (level === "medium") {
        badgeClass = "status-warning";
        levelText = "中风险";
    }

    const hitsListHtml = risk.reasons.length > 0
        ? risk.reasons.map(reason => `<li>⚠️ ${Utils.escapeHtml(reason)}</li>`).join("")
        : '<li class="safe-text">✅ 未发现隐蔽风险项</li>';

    // ====== 图片 PII 类别选择区域 ======
    let piiTypeHtml = "";
    const imgPii = fileData.result && fileData.result.image && fileData.result.image.pii;
    if (imgPii && imgPii.hasPii && imgPii.items && imgPii.items.length > 0) {
        // 按类别分组
        const typeGroups = {};
        imgPii.items.forEach((item, idx) => {
            if (!typeGroups[item.type]) {
                typeGroups[item.type] = { type: item.type, label: item.typeLabel, count: 0 };
            }
            typeGroups[item.type].count++;
        });

        // 按敏感程度排序
        const typeOrder = ["id_card", "name", "birth_date", "gender", "ethnic", "address", "phone"];
        const sortedTypes = Object.keys(typeGroups).sort((a, b) => {
            const ia = typeOrder.indexOf(a);
            const ib = typeOrder.indexOf(b);
            if (ia === -1 && ib === -1) return 0;
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });

        const typeItemsHtml = sortedTypes.map(type => {
            const g = typeGroups[type];
            return `
                <label class="pii-type-item-inline" style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;margin-bottom:4px;cursor:pointer;font-size:13px;">
                    <input type="checkbox" class="pii-type-checkbox" data-pii-type="${type}" checked style="vertical-align:middle;">
                    <span class="pii-type-badge pii-type-${type}" style="font-size:11px;padding:1px 6px;border-radius:4px;">${g.label}</span>
                    <span style="color:#999;font-size:11px;">(${g.count}处)</span>
                </label>
            `;
        }).join("");

        piiTypeHtml = `
            <div class="pii-type-select-area" style="margin-top:10px;padding-top:10px;border-top:1px dashed #ddd;">
                <div style="font-size:12px;color:#666;margin-bottom:6px;">
                    📌 选择要清洗的信息类别（默认全选）：
                </div>
                <div>${typeItemsHtml}</div>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="file-card-header">
            <span class="file-name">${Utils.escapeHtml(fileData.file.name)}</span>
            <span class="status-badge ${badgeClass}">${levelText} (${riskScore}分)</span>
        </div>
        <div class="file-card-body">
            <ul class="risk-hits-list">${hitsListHtml}</ul>
            ${piiTypeHtml}
        </div>
        <div class="file-card-actions">
            <button class="btn btn-sm btn-primary" onclick="cleanSingleFile('${fileData.id}')">单独清洗</button>
        </div>
    `;
}

/**
 * 渲染解析报错卡片
 */
function updateCardError(cardId, fileName, errorMsg) {
    const card = Utils.$(`#${cardId}`);
    if (!card) return;
    card.innerHTML = `
        <div class="file-card-header">
            <span class="file-name">${Utils.escapeHtml(fileName)}</span>
            <span class="status-badge status-error">解析失败</span>
        </div>
        <div class="file-card-body red-text">${Utils.escapeHtml(errorMsg)}</div>
    `;
}

/**
 * 单独清洗单个文件
 * @param {string} cardId
 * @param {Array<Object>} [customPiiItems] - 自定义要打码的 PII 项（不传则读取勾选框）
 */
async function cleanSingleFile(cardId, customPiiItems) {
    const item = currentBatchData.find(d => d.id === cardId);
    if (!item) return;

    const card = Utils.$(`#${cardId}`);
    const actionBtn = card ? card.querySelector(".file-card-actions .btn") : null;
    if (actionBtn) {
        actionBtn.disabled = true;
        actionBtn.textContent = "清洗中...";
    }

    try {
        // 获取要打码的 PII 项
        let piiItems = customPiiItems || null;
        if (!piiItems) {
            // 从当前卡片的复选框读取用户勾选的项
            piiItems = getSelectedPiiItemsFromCard(cardId);
        }

        const sanitizeOptions = {};
        if (piiItems && piiItems.length > 0) {
            sanitizeOptions.piiItems = piiItems;
        }

        const result = await sanitizeFile(item.file, item.result, sanitizeOptions);
        if (result.cleaned) {
            // 更新卡片 UI 显示已清洗，并提供下载链接
            const actionArea = card.querySelector(".file-card-actions");
            if (actionArea) {
                const downloadUrl = URL.createObjectURL(result.blob);
                actionArea.innerHTML = `
                    <span class="clean-success-text">✨ 已清洗</span>
                    <a class="btn btn-sm btn-success" href="${downloadUrl}" download="${Utils.escapeAttr(result.filename)}">下载安全副本</a>
                `;
            }
        } else {
            alert("清洗失败：" + result.error);
            if (actionBtn) {
                actionBtn.textContent = "单独清洗";
                actionBtn.disabled = false;
            }
        }
    } catch (err) {
        alert("清洗失败：" + err.message);
        if (actionBtn) {
            actionBtn.textContent = "单独清洗";
            actionBtn.disabled = false;
        }
    }
}

/**
 * 从指定卡片中获取用户勾选的 PII 项（按类别）
 * 如果卡片中没有类别勾选框（如批量模式），则返回所有 PII 项（默认全清洗）
 * @param {string} cardId
 * @returns {Array<Object>|null}
 */
function getSelectedPiiItemsFromCard(cardId) {
    const item = currentBatchData.find(d => d.id === cardId);
    if (!item || !item.result || !item.result.image || !item.result.image.pii) {
        return null;
    }
    const pii = item.result.image.pii;
    if (!pii.hasPii || !pii.items || pii.items.length === 0) {
        return null;
    }

    const card = Utils.$(`#${cardId}`);
    if (!card) return pii.items; // 找不到卡片也默认全清洗

    const typeCheckboxes = card.querySelectorAll(".pii-type-checkbox");
    // 如果卡片中没有类别勾选框（批量模式），默认清洗所有 PII
    if (typeCheckboxes.length === 0) {
        return pii.items;
    }

    // 有类别勾选框，读取勾选的类别
    const selectedTypes = new Set();
    typeCheckboxes.forEach(cb => {
        if (cb.checked) {
            const type = cb.getAttribute("data-pii-type");
            if (type) selectedTypes.add(type);
        }
    });

    if (selectedTypes.size === 0) return null;

    // 返回所有选中类别下的 PII 项
    const selected = pii.items.filter(item => selectedTypes.has(item.type));
    return selected.length > 0 ? selected : null;
}

/**
 * 批量一键清洗：对所有检测完成的文件逐个清洗，打包成 zip 下载
 * 失败的文件不阻断其余；已清洗的跳过；清洗成功/失败分别更新卡片
 */
async function handleBatchClean() {
    const items = currentBatchData.filter(d => d && d.file && d.result);
    if (items.length === 0) {
        alert("没有可清洗的文件，请先上传并完成检测");
        return;
    }

    const btn = Utils.$("#batch-clean-btn");
    if (btn) { btn.disabled = true; btn.textContent = "清洗中..."; }

    const cleanedFiles = [];   // { name, blob }
    const failed = [];         // { name, error }
    const usedNames = {};      // zip 内文件名去重

    function uniqueName(name) {
        if (!usedNames[name]) { usedNames[name] = 1; return name; }
        usedNames[name]++;
        const dot = name.lastIndexOf(".");
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : "";
        return base + "(" + usedNames[name] + ")" + ext;
    }

    try {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const card = Utils.$(`#${item.id}`);
            const actionArea = card ? card.querySelector(".file-card-actions") : null;

            // 已清洗的跳过
            if (item.cleaned) {
                if (actionArea) actionArea.innerHTML = `<span class="clean-success-text">✨ 已清洗</span>`;
                continue;
            }
            if (actionArea) {
                actionArea.innerHTML = `<span class="status-badge status-loading">清洗中...</span>`;
            }

            try {
                // 图片文件：传入检测到的 PII 项进行打码（批量模式默认全清洗）
                const sanitizeOptions = {};
                if (item.result && item.result.image && item.result.image.pii
                    && item.result.image.pii.hasPii && item.result.image.pii.items) {
                    sanitizeOptions.piiItems = item.result.image.pii.items;
                }

                const r = await sanitizeFile(item.file, item.result, sanitizeOptions);
                if (r.cleaned && r.blob) {
                    item.cleaned = true;
                    const name = uniqueName(r.filename || item.file.name);
                    cleanedFiles.push({ name, blob: r.blob });
                    const url = URL.createObjectURL(r.blob);
                    if (actionArea) {
                        actionArea.innerHTML = `
                            <span class="clean-success-text">✨ 已清洗</span>
                            <a class="btn btn-sm btn-success" href="${url}" download="${Utils.escapeAttr(name)}">下载</a>
                        `;
                    }
                } else {
                    failed.push({ name: item.file.name, error: r.error || "清洗失败" });
                    if (actionArea) actionArea.innerHTML = `<span class="status-badge status-error">清洗失败</span>`;
                }
            } catch (err) {
                failed.push({ name: item.file.name, error: err.message });
                if (actionArea) actionArea.innerHTML = `<span class="status-badge status-error">清洗失败</span>`;
            }
        }

        // 打包成功清洗的文件
        if (cleanedFiles.length > 0 && typeof JSZip !== "undefined") {
            const zip = new JSZip();
            cleanedFiles.forEach(f => zip.file(f.name, f.blob));
            const zipBlob = await zip.generateAsync({ type: "blob" });
            downloadBlob(zipBlob, "残影-批量清洗结果.zip");
            alert(`✅ 已清洗 ${cleanedFiles.length} 个文件，打包下载完成` + (failed.length ? `；${failed.length} 个失败` : ""));
        } else if (cleanedFiles.length > 0) {
            // 没有 JSZip 时逐个下载
            cleanedFiles.forEach(f => downloadBlob(f.blob, f.name));
            alert(`✅ 已逐个下载 ${cleanedFiles.length} 个清洗文件` + (failed.length ? `；${failed.length} 个失败` : ""));
        } else {
            alert("❌ 清洗失败：" + failed.map(f => `${f.name}（${f.error}）`).join("；"));
        }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "批量一键清洗"; }
    }
}

// ============================================================
// 导出到全局
// ============================================================
window.currentBatchData = currentBatchData;
window.handleMultipleFiles = handleMultipleFiles;
window.cleanSingleFile = cleanSingleFile;
window.handleBatchClean = handleBatchClean;
