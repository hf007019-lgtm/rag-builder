const API_BASE = "/api/v1";

let latestDocuments = [];
let lastSelectedDocId = null;

const healthGrid = document.getElementById("healthGrid");
const overallHealth = document.getElementById("overallHealth");
const recentDocuments = document.getElementById("recentDocuments");
const fileInput = document.getElementById("fileInput");
const selectedFileName = document.getElementById("selectedFileName");
const uploadButton = document.getElementById("uploadButton");
const uploadResult = document.getElementById("uploadResult");
const documentsList = document.getElementById("documentsList");
const refreshDocumentsButton = document.getElementById("refreshDocumentsButton");
const questionInput = document.getElementById("questionInput");
const askButton = document.getElementById("askButton");
const answerText = document.getElementById("answerText");
const sourceCount = document.getElementById("sourceCount");
const sourcesList = document.getElementById("sourcesList");
const taskLogTitle = document.getElementById("taskLogTitle");
const taskLogContent = document.getElementById("taskLogContent");
const toastRegion = document.getElementById("toastRegion");

const quickUpload = document.getElementById("quickUpload");
const quickRefresh = document.getElementById("quickRefresh");
const quickHealth = document.getElementById("quickHealth");
const quickLog = document.getElementById("quickLog");

const HEALTH_SERVICES = [
    { key: "postgresql", label: "PostgreSQL" },
    { key: "minio", label: "MinIO" },
    { key: "redis", label: "Redis" },
    { key: "elasticsearch", label: "Elasticsearch" }
];

// 初始化页面事件，并在页面加载后拉取服务状态和文档列表。
document.addEventListener("DOMContentLoaded", () => {
    bindNavigation();
    bindActions();
    checkHealth();
    loadDocuments();
});

// 检查 PostgreSQL、MinIO、Redis、Elasticsearch 等依赖服务状态。
async function checkHealth() {
    renderHealthStatus({ status: "checking", dependencies: {} });

    try {
        const response = await fetch(`${API_BASE}/health/dependencies`);

        if (!response.ok) {
            throw new Error(await readResponseError(response));
        }

        const data = await response.json();
        renderHealthStatus(data);
    } catch (error) {
        renderHealthStatus({ status: "error", dependencies: {} });
        showError(`服务状态检查失败：${getErrorText(error)}`);
    }
}

// 加载文档列表，并同步刷新左侧最近文档区域。
async function loadDocuments() {
    documentsList.innerHTML = "";
    documentsList.appendChild(createMutedLine("正在加载文档列表..."));

    try {
        const response = await fetch(`${API_BASE}/documents/`);

        if (!response.ok) {
            throw new Error(await readResponseError(response));
        }

        const data = await response.json();
        const documents = normalizeArray(data);
        latestDocuments = documents.map(normalizeDocument);
        renderDocuments(latestDocuments);
        renderRecentDocuments(latestDocuments);
    } catch (error) {
        latestDocuments = [];
        renderDocuments([]);
        renderRecentDocuments([]);
        showError(`文档列表加载失败：${getErrorText(error)}`);
    }
}

// 上传用户选择的文档文件，成功后自动刷新文档列表。
async function uploadDocument() {
    const file = fileInput.files && fileInput.files[0];

    if (!file) {
        showError("请先选择一个要上传的文档。");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);
    uploadButton.disabled = true;
    uploadButton.textContent = "上传中...";
    uploadResult.classList.remove("subtle");
    uploadResult.textContent = "正在上传文档，请稍候...";

    try {
        const response = await fetch(`${API_BASE}/documents/upload`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            throw new Error(await readResponseError(response));
        }

        const data = await response.json();
        const docId = data.doc_id ?? data.id ?? data.document_id ?? "-";
        const fileName = data.file_name ?? data.filename ?? file.name;
        const status = data.status ?? "PENDING";
        const message = data.message ?? data.msg ?? "上传成功，已加入解析队列。";

        renderKeyValues(uploadResult, [
            ["doc_id", docId],
            ["file_name", fileName],
            ["status", status],
            ["message", message]
        ]);

        showNotice("文档上传成功，正在刷新文档列表。");
        await loadDocuments();
    } catch (error) {
        uploadResult.textContent = "文档上传失败。";
        showError(`文档上传失败：${getErrorText(error)}`);
    } finally {
        uploadButton.disabled = false;
        uploadButton.textContent = "上传";
    }
}

// 根据输入框中的问题发起 RAG 问答，并渲染 answer 与 sources。
async function askQuestion() {
    const question = questionInput.value.trim();

    if (!question) {
        showError("请输入要检索的问题。");
        questionInput.focus();
        return;
    }

    askButton.disabled = true;
    askButton.textContent = "检索中...";
    answerText.textContent = "正在检索知识库并生成回答...";
    sourceCount.textContent = "sources 0";
    sourceCount.className = "status-badge neutral";
    renderSources([]);

    try {
        const response = await fetch(`${API_BASE}/search/ask`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ question })
        });

        if (!response.ok) {
            throw new Error(await readResponseError(response));
        }

        const data = await response.json();
        const answer = data.answer ?? data.result ?? "后端没有返回 answer 字段。";
        const sources = normalizeArray(data.sources);

        answerText.textContent = answer;
        sourceCount.textContent = `sources ${sources.length}`;
        sourceCount.className = sources.length > 0 ? "status-badge success" : "status-badge neutral";
        renderSources(sources);
        showNotice("检索完成。");
    } catch (error) {
        answerText.textContent = "问答请求失败，请检查文档是否已解析成功，或后端依赖服务是否正常。";
        sourceCount.textContent = "sources 0";
        sourceCount.className = "status-badge neutral";
        renderSources([]);
        showError(`问答请求失败：${getErrorText(error)}`);
    } finally {
        askButton.disabled = false;
        askButton.textContent = "开始检索";
    }
}

// 刷新单个文档的解析状态，并重新加载完整文档列表。
async function refreshDocumentStatus(docId) {
    if (!docId) {
        showError("缺少 doc_id，无法刷新状态。");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/documents/${encodeURIComponent(docId)}/status`);

        if (!response.ok) {
            throw new Error(await readResponseError(response));
        }

        const data = await response.json();
        const documentItem = normalizeDocument(data);
        showNotice(`文档 ${documentItem.doc_id} 当前状态：${documentItem.status}`);
        await loadDocuments();
    } catch (error) {
        showError(`文档状态刷新失败：${getErrorText(error)}`);
    }
}

// 加载指定文档的 Celery 解析任务日志，并展示到任务日志卡片。
async function loadTaskLog(docId) {
    if (!docId) {
        showError("缺少 doc_id，无法查看任务日志。");
        return;
    }

    lastSelectedDocId = docId;
    taskLogTitle.textContent = `任务日志 - doc_id=${docId}`;
    taskLogContent.innerHTML = "";
    taskLogContent.appendChild(createMutedLine("正在加载任务日志..."));

    try {
        const response = await fetch(`${API_BASE}/documents/${encodeURIComponent(docId)}/task-log`);

        if (!response.ok) {
            throw new Error(await readResponseError(response));
        }

        const logs = normalizeArray(await response.json());
        renderTaskLogs(logs);
        document.getElementById("task-log-card").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        taskLogContent.textContent = "任务日志获取失败";
        showError(`任务日志获取失败：${getErrorText(error)}`);
    }
}

// 渲染问答返回的 sources 来源片段列表。
function renderSources(sources) {
    const sourceItems = normalizeArray(sources);
    sourcesList.innerHTML = "";

    if (sourceItems.length === 0) {
        sourcesList.appendChild(createEmptyState("当前没有检索到来源"));
        return;
    }

    sourceItems.forEach((source, index) => {
        const item = document.createElement("article");
        item.className = "source-item";

        const title = createTextElement("div", "source-title", source.file_name ?? source.filename ?? "未命名来源");
        const meta = document.createElement("div");
        meta.className = "source-meta";
        appendMeta(meta, `doc_id=${source.doc_id ?? source.id ?? "-"}`);
        appendMeta(meta, `chunk_id=${source.chunk_id ?? source.chunkId ?? index + 1}`);

        if ((source.page_number ?? source.pageNumber) !== undefined && (source.page_number ?? source.pageNumber) !== null) {
            appendMeta(meta, `page=${source.page_number ?? source.pageNumber}`);
        }

        const chunkText = String(source.chunk_text ?? source.text ?? source.content ?? "");
        const preview = chunkText.length > 500 ? `${chunkText.slice(0, 500)}...` : chunkText;
        const text = createTextElement("div", "source-text", preview || "该来源没有返回 chunk_text。");

        item.append(title, meta, text);
        sourcesList.appendChild(item);
    });
}

// 渲染文档列表，并为每个文档挂载刷新状态和查看日志按钮。
function renderDocuments(documents) {
    const documentItems = normalizeArray(documents).map(normalizeDocument);
    documentsList.innerHTML = "";

    if (documentItems.length === 0) {
        documentsList.appendChild(createEmptyState("暂无文档"));
        return;
    }

    documentItems.forEach((doc) => {
        const item = document.createElement("article");
        item.className = "document-item";

        const main = document.createElement("div");
        main.className = "document-main";

        const info = document.createElement("div");
        const title = createTextElement("div", "document-title", doc.file_name);
        const meta = document.createElement("div");
        meta.className = "document-meta";
        appendMeta(meta, `doc_id=${doc.doc_id}`);

        if (doc.created_at) {
            appendMeta(meta, `created_at=${formatDate(doc.created_at)}`);
        }

        if (doc.updated_at) {
            appendMeta(meta, `updated_at=${formatDate(doc.updated_at)}`);
        }

        info.append(title, meta);

        const badge = createTextElement("span", `status-badge ${getDocumentStatusClass(doc.status)}`, doc.status);
        main.append(info, badge);

        const actions = document.createElement("div");
        actions.className = "document-actions";

        const refreshButton = createButton("刷新状态", "small-button", () => refreshDocumentStatus(doc.doc_id));
        const logButton = createButton("查看日志", "small-button", () => loadTaskLog(doc.doc_id));
        actions.append(refreshButton, logButton);

        item.append(main, actions);
        documentsList.appendChild(item);
    });
}

// 渲染依赖服务健康状态，兼容对象、数组以及字段缺失的返回格式。
function renderHealthStatus(data) {
    const dependencies = data?.dependencies ?? {};
    const overall = String(data?.status ?? "checking").toLowerCase();

    healthGrid.innerHTML = "";
    overallHealth.className = `status-badge ${getHealthStatusClass(overall)}`;
    overallHealth.textContent = getOverallHealthText(overall);

    HEALTH_SERVICES.forEach((service) => {
        const itemData = findDependency(dependencies, service);
        const status = String(itemData?.status ?? overall).toLowerCase();
        const row = document.createElement("div");
        row.className = "health-item";

        row.appendChild(createTextElement("div", "health-name", service.label));
        row.appendChild(createTextElement("span", `status-badge ${getHealthStatusClass(status)}`, getDependencyStatusText(status)));
        healthGrid.appendChild(row);
    });
}

// 显示中文错误提示，不中断页面其他交互。
function showError(message) {
    showToast(message, "error");
}

// 显示中文操作提示，用于反馈上传、刷新和检索成功。
function showNotice(message) {
    showToast(message, "notice");
}

// 绑定左侧导航点击事件，让导航项滚动到对应卡片。
function bindNavigation() {
    const navItems = document.querySelectorAll(".nav-item");

    navItems.forEach((item) => {
        item.addEventListener("click", () => {
            navItems.forEach((navItem) => navItem.classList.remove("active"));
            item.classList.add("active");

            const targetId = item.getAttribute("data-target");
            const target = targetId ? document.getElementById(targetId) : null;

            if (target) {
                target.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        });
    });
}

// 绑定页面按钮和文件选择框事件。
function bindActions() {
    askButton.addEventListener("click", askQuestion);
    uploadButton.addEventListener("click", uploadDocument);
    refreshDocumentsButton.addEventListener("click", loadDocuments);

    fileInput.addEventListener("change", () => {
        const file = fileInput.files && fileInput.files[0];
        selectedFileName.textContent = file ? file.name : "支持上传 txt 等本地知识库文件";
    });

    quickUpload.addEventListener("click", () => {
        document.getElementById("upload-card").scrollIntoView({ behavior: "smooth", block: "start" });
        fileInput.click();
    });

    quickRefresh.addEventListener("click", loadDocuments);
    quickHealth.addEventListener("click", checkHealth);

    quickLog.addEventListener("click", () => {
        if (lastSelectedDocId) {
            loadTaskLog(lastSelectedDocId);
            return;
        }

        document.getElementById("task-log-card").scrollIntoView({ behavior: "smooth", block: "start" });
        showNotice("请先在文档列表里点击“查看日志”。");
    });
}

// 渲染左侧最近上传的 5 个文档文件名。
function renderRecentDocuments(documents) {
    recentDocuments.innerHTML = "";
    const recent = normalizeArray(documents).slice(0, 5);

    if (recent.length === 0) {
        recentDocuments.appendChild(createMutedLine("暂无最近文档"));
        return;
    }

    recent.forEach((doc) => {
        recentDocuments.appendChild(createTextElement("div", "recent-doc", doc.file_name ?? "未命名文档"));
    });
}

// 渲染任务日志列表，兼容日志字段为空的情况。
function renderTaskLogs(logs) {
    const logItems = normalizeArray(logs);
    taskLogContent.innerHTML = "";

    if (logItems.length === 0) {
        taskLogContent.textContent = "暂无任务日志";
        return;
    }

    logItems.forEach((log) => {
        const item = document.createElement("article");
        item.className = "log-item";

        const title = createTextElement("div", "log-title", log.task_name ?? "未命名任务");
        const meta = document.createElement("div");
        meta.className = "log-meta";
        appendMeta(meta, `status=${log.status ?? "-"}`);
        appendMeta(meta, `log_id=${log.id ?? "-"}`);

        if ((log.chunk_count ?? log.chunkCount) !== undefined && (log.chunk_count ?? log.chunkCount) !== null) {
            appendMeta(meta, `chunk_count=${log.chunk_count ?? log.chunkCount}`);
        }

        if (log.created_at) {
            appendMeta(meta, `created_at=${formatDate(log.created_at)}`);
        }

        const message = log.error_message ?? log.message ?? "暂无任务日志";
        const body = createTextElement("div", "source-text", String(message));

        item.append(title, meta, body);
        taskLogContent.appendChild(item);
    });
}

// 从不同后端返回格式中提取数组。
function normalizeArray(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (Array.isArray(value?.items)) {
        return value.items;
    }

    if (Array.isArray(value?.documents)) {
        return value.documents;
    }

    if (Array.isArray(value?.data)) {
        return value.data;
    }

    return [];
}

// 标准化文档字段，兼容 doc_id/id、file_name/filename 等命名差异。
function normalizeDocument(doc) {
    return {
        doc_id: doc?.doc_id ?? doc?.id ?? doc?.document_id ?? "-",
        file_name: doc?.file_name ?? doc?.filename ?? doc?.name ?? "未命名文档",
        status: String(doc?.status ?? "UNKNOWN").toUpperCase(),
        created_at: doc?.created_at ?? doc?.createdAt ?? null,
        updated_at: doc?.updated_at ?? doc?.updatedAt ?? null
    };
}

// 从响应中读取错误文本，优先使用 FastAPI 的 detail 字段。
async function readResponseError(response) {
    try {
        const data = await response.json();

        if (typeof data?.detail === "string") {
            return data.detail;
        }

        if (Array.isArray(data?.detail)) {
            return data.detail.map((item) => item.msg ?? JSON.stringify(item)).join("；");
        }

        if (typeof data?.message === "string") {
            return data.message;
        }
    } catch (error) {
        return `${response.status} ${response.statusText || "请求失败"}`;
    }

    return `${response.status} ${response.statusText || "请求失败"}`;
}

// 获取可展示的错误文本，避免异常对象为空时显示 undefined。
function getErrorText(error) {
    return error?.message || "未知错误";
}

// 生成文本文档节点。
function createTextElement(tagName, className, text) {
    const element = document.createElement(tagName);

    if (className) {
        element.className = className;
    }

    element.textContent = text;
    return element;
}

// 生成普通提示行节点。
function createMutedLine(text) {
    return createTextElement("div", "muted-line", text);
}

// 生成空状态节点。
function createEmptyState(text) {
    return createTextElement("div", "empty-state", text);
}

// 生成按钮节点，并绑定点击事件。
function createButton(text, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
}

// 为 meta 容器追加一段元信息。
function appendMeta(container, text) {
    container.appendChild(createTextElement("span", "", text));
}

// 渲染键值结果，用于展示上传响应。
function renderKeyValues(container, rows) {
    container.innerHTML = "";
    const list = document.createElement("div");
    list.className = "kv-list";

    rows.forEach(([key, value]) => {
        const row = document.createElement("div");
        row.className = "kv-row";
        row.appendChild(createTextElement("span", "kv-key", key));
        row.appendChild(createTextElement("span", "kv-value", String(value ?? "-")));
        list.appendChild(row);
    });

    container.appendChild(list);
}

// 根据文档状态返回对应的视觉样式。
function getDocumentStatusClass(status) {
    const normalized = String(status ?? "").toUpperCase();

    if (normalized === "SUCCESS") {
        return "success";
    }

    if (normalized === "FAILED") {
        return "danger";
    }

    if (normalized === "PARSING") {
        return "info";
    }

    if (normalized === "PENDING") {
        return "neutral";
    }

    return "warning";
}

// 根据依赖服务状态返回对应的视觉样式。
function getHealthStatusClass(status) {
    const normalized = String(status ?? "").toLowerCase();

    if (normalized === "ok" || normalized === "success") {
        return "success";
    }

    if (normalized === "error" || normalized === "failed" || normalized === "fail") {
        return "danger";
    }

    if (normalized === "degraded" || normalized === "warning") {
        return "warning";
    }

    return "neutral";
}

// 把整体健康状态转换成中文展示文本。
function getOverallHealthText(status) {
    const normalized = String(status ?? "").toLowerCase();

    if (normalized === "ok") {
        return "正常";
    }

    if (normalized === "degraded") {
        return "部分异常";
    }

    if (normalized === "error") {
        return "异常";
    }

    return "检查中";
}

// 把单个依赖服务状态转换成中文展示文本。
function getDependencyStatusText(status) {
    const normalized = String(status ?? "").toLowerCase();

    if (normalized === "ok" || normalized === "success") {
        return "正常";
    }

    if (normalized === "error" || normalized === "failed" || normalized === "fail") {
        return "异常";
    }

    if (normalized === "degraded" || normalized === "warning") {
        return "警告";
    }

    return "检查中";
}

// 在对象或数组格式的依赖结果中查找指定服务。
function findDependency(dependencies, service) {
    if (Array.isArray(dependencies)) {
        return dependencies.find((item) => {
            const name = String(item?.name ?? item?.key ?? "").toLowerCase();
            return name === service.key || name === service.label.toLowerCase();
        });
    }

    return dependencies?.[service.key] ?? dependencies?.[service.label] ?? null;
}

// 格式化时间字段，失败时返回原始文本。
function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString("zh-CN", { hour12: false });
}

// 展示页面右下角轻量提示。
function showToast(message, type) {
    const toast = createTextElement("div", `toast ${type}`, message);
    toastRegion.appendChild(toast);

    window.setTimeout(() => {
        toast.remove();
    }, 4200);
}
