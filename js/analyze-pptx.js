/**
 * analyze-pptx.js
 * PPTX(.pptx) 隐性泄露检测：演讲者备注页 / 批注 / 隐藏幻灯片 / 元数据
 *
 * 原理：PPTX 是 OOXML zip，用 JSZip 解压后解析：
 *   - ppt/notesSlides/notesSlideN.xml   → 演讲者备注（常见二次泄露点，观众看不到但文件里有）
 *   - ppt/comments/commentN.xml         → 批注（作者+内容）
 *   - ppt/presentation.xml 里 <p:sldId show="0"> → 隐藏幻灯片
 *   - docProps/core.xml + app.xml       → 元数据（作者/最后修改者/公司等）
 *
 * 返回结构与 analyzeXlsx 一致，供 risk-score.js 统一评分。
 */
window.analyzePptx = async function (file) {
    const buffer = await Utils.readFileAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(buffer);

    const hidden = { hasHidden: false, items: [] };
    const comments = { hasComments: false, count: 0, items: [] };
    const metadata = { hasSensitive: false, author: "", lastModifiedBy: "", title: "", subject: "", company: "", manager: "" };

    const readEntry = async (path) => {
        const f = zip.file(path);
        return f ? f.async("string") : null;
    };
    // 解析 XML 里的全部 <a:t> 文本
    const extractATexts = (xml) => {
        const out = [];
        const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
        let m;
        while ((m = re.exec(xml))) out.push(m[1]);
        return out;
    };

    // ---- 1. 演讲者备注页 ----
    let notesCount = 0;
    const notesTexts = [];
    for (let n = 1; n <= 500; n++) {
        const xml = await readEntry(`ppt/notesSlides/notesSlide${n}.xml`);
        if (!xml) continue;
        notesCount++;
        const texts = extractATexts(xml).filter(t => t && t.trim());
        if (texts.length > 0) {
            const joined = texts.join(" ").trim();
            notesTexts.push({ slide: n, text: joined });
            hidden.items.push({ type: "备注页", text: joined.slice(0, 120), slide: n });
        }
    }
    if (notesCount > 0 && notesTexts.length > 0) {
        hidden.hasHidden = true;
    }

    // ---- 2. 批注 ----
    for (let n = 1; n <= 100; n++) {
        const xml = await readEntry(`ppt/comments/comment${n}.xml`);
        if (!xml) continue;
        const authorRe = /<p:author>([\s\S]*?)<\/p:author>/g;
        const textRe = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
        let a, t, author = "", ttext = "";
        if ((a = authorRe.exec(xml))) author = a[1];
        if ((t = textRe.exec(xml))) ttext = t[1];
        comments.count++;
        comments.items.push({ author: author || "未知", text: ttext.slice(0, 200) });
    }
    if (comments.count > 0) comments.hasComments = true;

    // ---- 3. 隐藏幻灯片 ----
    const presXml = await readEntry("ppt/presentation.xml");
    if (presXml) {
        const hiddenSlides = (presXml.match(/<p:sldId[^>]*show="0"/g) || []).length;
        if (hiddenSlides > 0) {
            hidden.hasHidden = true;
            hidden.items.push({ type: "隐藏幻灯片", text: `${hiddenSlides} 页幻灯片被隐藏（可能含敏感内容）` });
        }
    }

    // ---- 4. 元数据 ----
    const coreXml = await readEntry("docProps/core.xml");
    if (coreXml) {
        const g = (tag) => {
            const m = coreXml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
            return m ? m[1] : "";
        };
        metadata.author = g("dc:creator");
        metadata.lastModifiedBy = g("cp:lastModifiedBy");
        metadata.title = g("dc:title");
        metadata.subject = g("dc:subject");
    }
    const appXml = await readEntry("docProps/app.xml");
    if (appXml) {
        const g = (tag) => {
            const m = appXml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
            return m ? m[1] : "";
        };
        metadata.company = g("Company");
        metadata.manager = g("Manager");
    }
    metadata.hasSensitive = Boolean(metadata.author || metadata.lastModifiedBy || metadata.company || metadata.manager);

    return {
        hidden,
        comments,
        metadata,
        summary: {
            notesCount,
            notes: notesTexts.map(n => n.text.slice(0, 80)),
        },
    };
};
