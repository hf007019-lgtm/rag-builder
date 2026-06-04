const API_BASE = "/api/v1";

let latestDocuments = [];
let lastSelectedDocId = null;
let recentQuestionItems = [];
let fileSelectionOrigin = "panel";
let lastSourceContainer = null;

const healthGrid = document.getElementById("healthGrid");
const overallHealth = document.getElementById("overallHealth");
const recentQuestions = document.getElementById("recentQuestions");
const recentDocuments = document.getElementById("recentDocuments");
const fileInput = document.getElementById("fileInput");
const selectedFileName = document.getElementById("selectedFileName");
const uploadButton = document.getElementById("uploadButton");
const uploadResult = document.getElementById("uploadResult");
const documentsList = document.getElementById("documentsList");
const logDocumentList = document.getElementById("logDocumentList");
const refreshDocumentsButton = document.getElementById("refreshDocumentsButton");
const refreshHealthButton = document.getElementById("refreshHealthButton");
const questionInput = document.getElementById("questionInput");
const askButton = document.getElementById("askButton");
const attachmentButton = document.getElementById("attachmentButton");
const chooseFileButton = document.getElementById("chooseFileButton");
const composerHint = document.getElementById("composerHint");
const chatScroll = document.getElementById("chatScroll");
const chatMessages = document.getElementById("chatMessages");
const emptyState = document.getElementById("emptyState");
const taskLogTitle = document.getElementById("taskLogTitle");
const taskLogContent = document.getElementById("taskLogContent");
const toastRegion = document.getElementById("toastRegion");
const newChatButton = document.getElementById("newChatButton");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");

const HEALTH_SERVICES = [
    { key: "postgresql", label: "PostgreSQL" },
    { key: "minio", label: "MinIO" },
    { key: "redis", label: "Redis" },
    { key: "elasticsearch", label: "Elasticsearch" }
];

// 初始化页面事件，并预加载文档列表和依赖服务状态。
document.addEventListener("DOMContentLoaded", () => {
    bindNavigation();
    bindActions();
    renderRecentQuestions();
    loadDocuments();
    checkHealth();
    resizeQuestionInput();
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

// 加载文档列表，并同步更新文档管理、日志选择器和侧栏最近文档。
async function loadDocuments() {
    documentsList.innerHTML = "";
    documentsList.appendChild(createEmptyState("正在加载文档列表..."));

    try {
        const response = await fetch(`${API_BASE}/documents/`);

        if (!response.ok) {
            throw new Error(await readResponseError(response));
        }

        const data = await response.json();
        latestDocuments = normalizeArray(data).map(normalizeDocument);
        renderDocuments(latestDocuments);
        renderRecentDocuments(latestDocuments);
        renderLogDocumentList(latestDocuments);
    } catch (error) {
        latestDocuments = [];
        renderDocuments([]);
        renderRecentDocuments([]);
        renderLogDocumentList([]);
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
    attachmentButton.disabled = true;
    uploadButton.textContent = "上传中...";
    composerHint.textContent = `正在上传 ${file.name}...`;
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

        composerHint.textContent = `${fileName} 已加入解析队列`;
        showNotice("文档上传成功，正在刷新文档列表。");
        await loadDocuments();
        fileInput.value = "";
        selectedFileName.textContent = "选择本地文件后开始上传";
    } catch (error) {
        uploadResult.textContent = "文档上传失败。";
        composerHint.textContent = "文档上传失败，请稍后重试";
        showError(`文档上传失败：${getErrorText(error)}`);
    } finally {
        uploadButton.disabled = false;
        attachmentButton.disabled = false;
        uploadButton.textContent = "上传文档";
    }
}

// 根据输入框中的问题发起 RAG 问答，并将结果追加到聊天消息流。
async function askQuestion() {
    if (askButton.disabled) {
        return;
    }

    const question = questionInput.value.trim();

    if (!question) {
        showError("请输入要检索的问题。");
        questionInput.focus();
        return;
    }

    setView("chat");
    emptyState.classList.add("hidden");
    appendUserMessage(question);
    addRecentQuestion(question);

    const assistantMessage = createAssistantMessage();
    lastSourceContainer = assistantMessage.sourceList;
    questionInput.value = "";
    resizeQuestionInput();
    askButton.disabled = true;
    askButton.textContent = "…";
    composerHint.textContent = "正在检索知识库并生成回答...";
    scrollChatToBottom();

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

        assistantMessage.answer.classList.remove("loading");
        assistantMessage.answer.textContent = answer;
        renderSources(sources, assistantMessage.sourceList);
        composerHint.textContent = `回答完成 · sources ${sources.length}`;
    } catch (error) {
        assistantMessage.answer.classList.remove("loading");
        assistantMessage.answer.classList.add("error");
        assistantMessage.answer.textContent = "问答请求失败，请检查文档是否已解析成功，或后端依赖服务是否正常。";
        renderSources([], assistantMessage.sourceList);
        composerHint.textContent = "检索失败，请检查服务状态";
        showError(`问答请求失败：${getErrorText(error)}`);
    } finally {
        askButton.disabled = false;
        askButton.textContent = "↑";
        scrollChatToBottom();
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

// 加载指定文档的解析任务日志，并切换到解析日志面板展示。
async function loadTaskLog(docId) {
    if (!docId) {
        showError("缺少 doc_id，无法查看任务日志。");
        return;
    }

    lastSelectedDocId = docId;
    setView("logs");
    taskLogTitle.textContent = `解析日志 · doc_id=${docId}`;
    taskLogContent.innerHTML = "";
    taskLogContent.appendChild(createEmptyState("正在加载任务日志..."));
    renderLogDocumentList(latestDocuments);

    try {
        const response = await fetch(`${API_BASE}/documents/${encodeURIComponent(docId)}/task-log`);

        if (!response.ok) {
            throw new Error(await readResponseError(response));
        }

        const logs = normalizeArray(await response.json());
        renderTaskLogs(logs);
    } catch (error) {
        taskLogContent.innerHTML = "";
        taskLogContent.appendChild(createEmptyState("任务日志获取失败"));
        showError(`任务日志获取失败：${getErrorText(error)}`);
    }
}

// 渲染问答返回的 sources 来源片段列表。
function renderSources(sources, targetContainer = lastSourceContainer) {
    if (!targetContainer) {
        return;
    }

    const sourceItems = normalizeArray(sources);
    const section = targetContainer.closest(".sources-section");
    const heading = section ? section.querySelector(".sources-heading") : null;
    targetContainer.innerHTML = "";

    if (section) {
        section.hidden = false;
    }

    if (heading) {
        heading.textContent = `Sources · ${sourceItems.length}`;
    }

    if (sourceItems.length === 0) {
        targetContainer.appendChild(createEmptyState("当前没有检索到来源"));
        return;
    }

    sourceItems.forEach((source, index) => {
        const details = document.createElement("details");
        details.className = "source-item";
        details.open = index === 0;

        const summary = document.createElement("summary");
        const fileName = source.file_name ?? source.filename ?? "未命名来源";
        summary.append(
            createTextElement("span", "source-title", fileName),
            createTextElement("span", "source-index", `来源 ${index + 1}`)
        );

        const body = document.createElement("div");
        body.className = "source-body";

        const meta = document.createElement("div");
        meta.className = "source-meta";
        appendMeta(meta, `doc_id=${source.doc_id ?? source.id ?? "-"}`);
        appendMeta(meta, `chunk_id=${source.chunk_id ?? source.chunkId ?? index + 1}`);

        const pageNumber = source.page_number ?? source.pageNumber;
        if (pageNumber !== undefined && pageNumber !== null) {
            appendMeta(meta, `page=${pageNumber}`);
        }

        const chunkText = String(source.chunk_text ?? source.text ?? source.content ?? "");
        const preview = chunkText.length > 500 ? `${chunkText.slice(0, 500)}...` : chunkText;
        body.append(meta, createTextElement("div", "source-text", preview || "该来源没有返回 chunk_text。"));
        details.append(summary, body);
        targetContainer.appendChild(details);
    });
}

// 渲染文档管理列表，并提供状态刷新、重试解析、查看日志和删除操作。
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
        const meta = document.createElement("div");
        meta.className = "document-meta";
        appendMeta(meta, `doc_id=${doc.doc_id}`);

        if (doc.created_at) {
            appendMeta(meta, `created_at=${formatDate(doc.created_at)}`);
        }

        if (doc.updated_at) {
            appendMeta(meta, `updated_at=${formatDate(doc.updated_at)}`);
        }

        info.append(createTextElement("div", "document-title", doc.file_name), meta);
        main.append(info, createTextElement("span", `status-badge ${getDocumentStatusClass(doc.status)}`, doc.status));

        const actions = document.createElement("div");
        actions.className = "document-actions";
        const refreshButton = createButton("刷新状态", "small-button", () => refreshDocumentStatus(doc.doc_id));
        const retryButton = createButton("重试解析", "small-button", () => retryDocument(doc.doc_id));
        const logButton = createButton("查看日志", "small-button", () => loadTaskLog(doc.doc_id));
        const deleteButton = createButton("删除", "small-button danger-button", () => deleteDocument(doc.doc_id, doc.file_name));

        retryButton.disabled = doc.status !== "FAILED";
        retryButton.title = doc.status === "FAILED" ? "重新派发解析任务" : "仅失败文档可以重试";
        actions.append(refreshButton, retryButton, logButton, deleteButton);
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
        row.title = itemData?.message ?? "";
        row.append(
            createTextElement("div", "health-name", service.label),
            createTextElement("span", `status-badge ${getHealthStatusClass(status)}`, getDependencyStatusText(status))
        );
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

// 绑定侧栏导航、返回问答和移动端导航抽屉事件。
function bindNavigation() {
    document.querySelectorAll(".nav-item[data-view]").forEach((item) => {
        item.addEventListener("click", () => setView(item.dataset.view));
    });

    document.querySelectorAll(".return-chat-button").forEach((button) => {
        button.addEventListener("click", () => setView("chat"));
    });

    document.querySelectorAll(".mobile-menu-button").forEach((button) => {
        button.addEventListener("click", () => document.body.classList.add("sidebar-open"));
    });

    sidebarBackdrop.addEventListener("click", closeSidebar);
    newChatButton.addEventListener("click", newChat);
}

// 绑定聊天输入、文件上传和面板操作事件。
function bindActions() {
    askButton.addEventListener("click", askQuestion);
    uploadButton.addEventListener("click", uploadDocument);
    refreshDocumentsButton.addEventListener("click", loadDocuments);
    refreshHealthButton.addEventListener("click", checkHealth);

    attachmentButton.addEventListener("click", () => {
        fileSelectionOrigin = "composer";
        fileInput.value = "";
        fileInput.click();
    });

    chooseFileButton.addEventListener("click", () => {
        fileSelectionOrigin = "panel";
        fileInput.value = "";
        fileInput.click();
    });

    fileInput.addEventListener("change", () => {
        const file = fileInput.files && fileInput.files[0];
        selectedFileName.textContent = file ? file.name : "选择本地文件后开始上传";

        if (file && fileSelectionOrigin === "composer") {
            uploadDocument();
        }
    });

    questionInput.addEventListener("input", resizeQuestionInput);
    questionInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            askQuestion();
        }
    });
}

// 切换聊天、文档、日志和系统状态工作视图。
function setView(viewName) {
    document.querySelectorAll(".app-view").forEach((view) => {
        view.classList.toggle("active", view.dataset.viewName === viewName);
    });

    document.querySelectorAll(".nav-item[data-view]").forEach((item) => {
        item.classList.toggle("active", item.dataset.view === viewName);
    });

    closeSidebar();

    if (viewName === "documents") {
        loadDocuments();
    } else if (viewName === "logs") {
        renderLogDocumentList(latestDocuments);
    } else if (viewName === "health") {
        checkHealth();
    } else if (viewName === "chat") {
        window.setTimeout(() => questionInput.focus(), 0);
    }
}

// 新建一个空白问答会话，并保留侧栏中的最近问题记录。
function newChat() {
    chatMessages.innerHTML = "";
    emptyState.classList.remove("hidden");
    questionInput.value = "";
    composerHint.textContent = "RAG Builder 会基于已解析文档回答";
    resizeQuestionInput();
    setView("chat");
}

// 将用户问题追加到聊天消息流。
function appendUserMessage(question) {
    const message = document.createElement("article");
    message.className = "message message-user";
    message.appendChild(createTextElement("div", "user-bubble", question));
    chatMessages.appendChild(message);
}

// 创建一个等待后端回答的系统消息，并返回可更新的节点。
function createAssistantMessage() {
    const message = document.createElement("article");
    message.className = "message message-assistant";

    const inner = document.createElement("div");
    inner.className = "assistant-message";

    const answer = createTextElement("div", "assistant-answer loading", "正在检索知识库并生成回答...");
    const sourcesSection = document.createElement("section");
    sourcesSection.className = "sources-section";
    sourcesSection.hidden = true;

    const sourcesHeading = createTextElement("div", "sources-heading", "Sources · 0");
    const sourceList = document.createElement("div");
    sourceList.className = "source-list";
    sourcesSection.append(sourcesHeading, sourceList);

    inner.append(createTextElement("div", "message-label", "RAG Builder"), answer, sourcesSection);
    message.appendChild(inner);
    chatMessages.appendChild(message);
    return { answer, sourceList };
}

// 记录本次会话最近的问题，并刷新侧栏历史列表。
function addRecentQuestion(question) {
    recentQuestionItems = [question, ...recentQuestionItems.filter((item) => item !== question)].slice(0, 7);
    renderRecentQuestions();
}

// 渲染侧栏最近问答，点击后可重新填入问题。
function renderRecentQuestions() {
    recentQuestions.innerHTML = "";

    if (recentQuestionItems.length === 0) {
        recentQuestions.appendChild(createTextElement("div", "sidebar-empty", "本次会话暂无问答"));
        return;
    }

    recentQuestionItems.forEach((question) => {
        const button = createButton(question, "history-item", () => {
            setView("chat");
            questionInput.value = question;
            resizeQuestionInput();
            questionInput.focus();
        });
        button.title = question;
        recentQuestions.appendChild(button);
    });
}

// 渲染侧栏最近 5 个文档的简洁列表。
function renderRecentDocuments(documents) {
    recentDocuments.innerHTML = "";
    const recent = normalizeArray(documents).slice(0, 5);

    if (recent.length === 0) {
        recentDocuments.appendChild(createTextElement("div", "sidebar-empty", "暂无最近文档"));
        return;
    }

    recent.forEach((doc) => {
        const button = createButton(doc.file_name ?? "未命名文档", "history-item", () => setView("documents"));
        button.title = `${doc.file_name ?? "未命名文档"} · ${doc.status ?? "UNKNOWN"}`;
        recentDocuments.appendChild(button);
    });
}

// 渲染日志面板中的文档选择器。
function renderLogDocumentList(documents) {
    logDocumentList.innerHTML = "";
    const documentItems = normalizeArray(documents).map(normalizeDocument);

    if (documentItems.length === 0) {
        logDocumentList.appendChild(createEmptyState("暂无文档可查看"));
        return;
    }

    documentItems.forEach((doc) => {
        const button = createButton(doc.file_name, "document-picker-button", () => loadTaskLog(doc.doc_id));
        button.classList.toggle("active", String(doc.doc_id) === String(lastSelectedDocId));
        button.title = `doc_id=${doc.doc_id}`;
        logDocumentList.appendChild(button);
    });
}

// 渲染任务日志列表，兼容日志字段为空的情况。
function renderTaskLogs(logs) {
    const logItems = normalizeArray(logs);
    taskLogContent.innerHTML = "";

    if (logItems.length === 0) {
        taskLogContent.appendChild(createEmptyState("暂无任务日志"));
        return;
    }

    logItems.forEach((log) => {
        const item = document.createElement("article");
        item.className = "log-item";

        const meta = document.createElement("div");
        meta.className = "log-meta";
        appendMeta(meta, `status=${log.status ?? "-"}`);
        appendMeta(meta, `log_id=${log.id ?? "-"}`);

        const chunkCount = log.chunk_count ?? log.chunkCount;
        if (chunkCount !== undefined && chunkCount !== null) {
            appendMeta(meta, `chunk_count=${chunkCount}`);
        }

        if (log.created_at) {
            appendMeta(meta, `created_at=${formatDate(log.created_at)}`);
        }

        const message = log.error_message ?? log.message ?? "暂无任务日志";
        item.append(
            createTextElement("div", "log-title", log.task_name ?? "未命名任务"),
            meta,
            createTextElement("div", "source-text", String(message))
        );
        taskLogContent.appendChild(item);
    });
}

// 重新派发失败文档的解析任务。
async function retryDocument(docId) {
    try {
        const response = await fetch(`${API_BASE}/documents/${encodeURIComponent(docId)}/retry`, {
            method: "POST"
        });

        if (!response.ok) {
            throw new Error(await readResponseError(response));
        }

        const data = await response.json();
        showNotice(data.message ?? `文档 ${docId} 已重新加入解析队列。`);
        await loadDocuments();
    } catch (error) {
        showError(`重新解析失败：${getErrorText(error)}`);
    }
}

// 删除指定文档，并在删除成功后刷新文档列表。
async function deleteDocument(docId, fileName) {
    const confirmed = window.confirm(`确定删除文档“${fileName}”吗？该操作会同时删除对应的向量片段。`);

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/documents/${encodeURIComponent(docId)}`, {
            method: "DELETE"
        });

        if (!response.ok) {
            throw new Error(await readResponseError(response));
        }

        const data = await response.json();
        showNotice(data.msg ?? "文档删除成功。");
        await loadDocuments();
    } catch (error) {
        showError(`文档删除失败：${getErrorText(error)}`);
    }
}

// 自动调整聊天输入框高度，避免输入内容被遮挡。
function resizeQuestionInput() {
    questionInput.style.height = "auto";
    questionInput.style.height = `${Math.min(questionInput.scrollHeight, 180)}px`;
}

// 将聊天区域滚动到最新消息。
function scrollChatToBottom() {
    window.setTimeout(() => {
        chatScroll.scrollTop = chatScroll.scrollHeight;
    }, 0);
}

// 关闭移动端侧栏抽屉。
function closeSidebar() {
    document.body.classList.remove("sidebar-open");
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
        row.append(
            createTextElement("span", "kv-key", key),
            createTextElement("span", "kv-value", String(value ?? "-"))
        );
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
