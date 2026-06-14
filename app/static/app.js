const API_BASE = "/api/v1";

const VIEW_META = {
    dashboard: { eyebrow: "Workspace overview", title: "总览" },
    playground: { eyebrow: "Knowledge playground", title: "知识库问答" },
    documents: { eyebrow: "Knowledge assets", title: "文档管理" },
    pipeline: { eyebrow: "Processing observability", title: "解析流水线" },
    retrieval: { eyebrow: "Retrieval inspection", title: "检索调试" },
    evaluation: { eyebrow: "RAG quality evaluation", title: "评测报告" },
    health: { eyebrow: "Runtime dependencies", title: "系统状态" }
};

const HEALTH_ORDER = [
    "fastapi",
    "postgresql",
    "minio",
    "redis",
    "elasticsearch",
    "celery",
    "embedding",
    "llm",
    "rerank"
];

const SIDEBAR_HEALTH_ORDER = [
    "fastapi",
    "elasticsearch",
    "postgresql",
    "minio",
    "redis"
];

let latestDocuments = [];
let latestEvaluation = null;
let latestSystemStatus = null;
let selectedDocumentId = null;
let fileSelectionOrigin = "documents";
let answerSequence = 0;
let selectedAnswerId = null;
const answerEvidenceById = new Map();

const $ = (id) => document.getElementById(id);

const elements = {
    askButton: $("askButton"),
    attachmentButton: $("attachmentButton"),
    chatMessages: $("chatMessages"),
    chatScroll: $("chatScroll"),
    chooseFileButton: $("chooseFileButton"),
    composerHint: $("composerHint"),
    contextBackdrop: $("contextBackdrop"),
    dashboardAskButton: $("dashboardAskButton"),
    dashboardChunkCount: $("dashboardChunkCount"),
    dashboardDocumentCount: $("dashboardDocumentCount"),
    dashboardEvalFallback: $("dashboardEvalFallback"),
    dashboardEvalMetrics: $("dashboardEvalMetrics"),
    dashboardEvalRate: $("dashboardEvalRate"),
    dashboardEvalSource: $("dashboardEvalSource"),
    dashboardRecentDocuments: $("dashboardRecentDocuments"),
    dashboardSuccessCount: $("dashboardSuccessCount"),
    documentDetailContent: $("documentDetailContent"),
    documentResultCount: $("documentResultCount"),
    documentSearchInput: $("documentSearchInput"),
    documentStatusFilter: $("documentStatusFilter"),
    documentsList: $("documentsList"),
    emptyState: $("emptyState"),
    evaluationFailureCount: $("evaluationFailureCount"),
    evaluationFailureList: $("evaluationFailureList"),
    evaluationGeneratedAt: $("evaluationGeneratedAt"),
    evaluationMessage: $("evaluationMessage"),
    evidenceCloseButton: $("evidenceCloseButton"),
    evidenceContent: $("evidenceContent"),
    evidenceCount: $("evidenceCount"),
    evidenceStatus: $("evidenceStatus"),
    evidenceToggle: $("evidenceToggle"),
    fileInput: $("fileInput"),
    globalEyebrow: $("globalEyebrow"),
    globalStatusButton: $("globalStatusButton"),
    globalStatusDot: $("globalStatusDot"),
    globalStatusText: $("globalStatusText"),
    globalViewTitle: $("globalViewTitle"),
    headerEvidenceCount: $("headerEvidenceCount"),
    healthGrid: $("healthGrid"),
    mobileMenuButton: $("mobileMenuButton"),
    overallHealth: $("overallHealth"),
    pipelineTaskCount: $("pipelineTaskCount"),
    pipelineTaskList: $("pipelineTaskList"),
    playgroundMode: $("playgroundMode"),
    playgroundRerank: $("playgroundRerank"),
    playgroundThreshold: $("playgroundThreshold"),
    playgroundTopK: $("playgroundTopK"),
    questionInput: $("questionInput"),
    refreshDocumentsButton: $("refreshDocumentsButton"),
    refreshEvaluationButton: $("refreshEvaluationButton"),
    refreshHealthButton: $("refreshHealthButton"),
    refreshPipelineButton: $("refreshPipelineButton"),
    retrievalLatency: $("retrievalLatency"),
    retrievalQueryInput: $("retrievalQueryInput"),
    retrievalRerankInput: $("retrievalRerankInput"),
    retrievalRerankStatus: $("retrievalRerankStatus"),
    retrievalResults: $("retrievalResults"),
    retrievalTopKInput: $("retrievalTopKInput"),
    runRetrievalButton: $("runRetrievalButton"),
    selectedFileName: $("selectedFileName"),
    sidebarBackdrop: $("sidebarBackdrop"),
    sidebarHealthList: $("sidebarHealthList"),
    sidebarOverallDot: $("sidebarOverallDot"),
    sidebarOverallText: $("sidebarOverallText"),
    sidebarRefreshStatus: $("sidebarRefreshStatus"),
    sidebarUploadButton: $("sidebarUploadButton"),
    toastRegion: $("toastRegion"),
    uploadButton: $("uploadButton"),
    uploadResult: $("uploadResult")
};

document.addEventListener("DOMContentLoaded", () => {
    bindNavigation();
    bindActions();
    setView("dashboard");
    resizeQuestionInput();

    Promise.allSettled([
        loadDocuments(),
        loadEvaluation(),
        loadSystemStatus()
    ]);
});

function bindNavigation() {
    document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
        button.addEventListener("click", () => setView(button.dataset.view));
    });

    document.querySelectorAll("[data-view-target]").forEach((button) => {
        button.addEventListener("click", () => setView(button.dataset.viewTarget));
    });

    elements.mobileMenuButton.addEventListener("click", () => {
        document.body.classList.add("sidebar-open");
    });
    elements.sidebarBackdrop.addEventListener("click", closeSidebar);
    elements.contextBackdrop.addEventListener("click", closeContextPanel);
    elements.evidenceCloseButton.addEventListener("click", closeContextPanel);
    elements.evidenceToggle.addEventListener("click", toggleContextPanel);
    elements.globalStatusButton.addEventListener("click", () => setView("health"));

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeSidebar();
            closeContextPanel();
        }
    });
}

function bindActions() {
    elements.dashboardAskButton.addEventListener("click", () => {
        setView("playground");
        window.setTimeout(() => elements.questionInput.focus(), 0);
    });

    const openDocumentUpload = () => {
        setView("documents");
        window.setTimeout(() => {
            fileSelectionOrigin = "documents";
            elements.fileInput.value = "";
            elements.fileInput.click();
        }, 0);
    };
    elements.sidebarUploadButton.addEventListener("click", openDocumentUpload);
    $("dashboardUploadButton").addEventListener("click", openDocumentUpload);

    elements.askButton.addEventListener("click", askQuestion);
    elements.questionInput.addEventListener("input", resizeQuestionInput);
    elements.questionInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            askQuestion();
        }
    });

    document.querySelectorAll("[data-question]").forEach((button) => {
        button.addEventListener("click", () => {
            elements.questionInput.value = button.dataset.question;
            resizeQuestionInput();
            askQuestion();
        });
    });

    elements.attachmentButton.addEventListener("click", () => {
        fileSelectionOrigin = "playground";
        elements.fileInput.value = "";
        elements.fileInput.click();
    });
    elements.chooseFileButton.addEventListener("click", () => {
        fileSelectionOrigin = "documents";
        elements.fileInput.value = "";
        elements.fileInput.click();
    });
    elements.fileInput.addEventListener("change", handleFileSelection);
    elements.uploadButton.addEventListener("click", uploadDocument);

    elements.refreshDocumentsButton.addEventListener("click", loadDocuments);
    elements.documentSearchInput.addEventListener("input", renderDocuments);
    elements.documentStatusFilter.addEventListener("change", renderDocuments);
    elements.refreshPipelineButton.addEventListener("click", loadRecentTaskLogs);
    elements.runRetrievalButton.addEventListener("click", runRetrievalTest);
    elements.retrievalQueryInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            runRetrievalTest();
        }
    });
    elements.refreshEvaluationButton.addEventListener("click", loadEvaluation);
    elements.refreshHealthButton.addEventListener("click", loadSystemStatus);
    elements.sidebarRefreshStatus.addEventListener("click", loadSystemStatus);
}

function setView(viewName) {
    const meta = VIEW_META[viewName] || VIEW_META.dashboard;

    document.querySelectorAll(".app-view").forEach((view) => {
        view.classList.toggle("active", view.dataset.viewName === viewName);
    });
    document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
        const active = button.dataset.view === viewName;
        button.classList.toggle("active", active);
        if (active) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    });

    elements.globalEyebrow.textContent = meta.eyebrow;
    elements.globalViewTitle.textContent = meta.title;
    closeSidebar();

    if (viewName !== "playground") {
        closeContextPanel();
    }

    if (viewName === "documents" && latestDocuments.length === 0) {
        loadDocuments();
    } else if (viewName === "pipeline") {
        loadRecentTaskLogs();
    } else if (viewName === "evaluation" && latestEvaluation === null) {
        loadEvaluation();
    } else if (viewName === "health" && latestSystemStatus === null) {
        loadSystemStatus();
    } else if (viewName === "playground") {
        window.setTimeout(() => elements.questionInput.focus(), 0);
    }
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);

    if (!response.ok) {
        throw new Error(await readResponseError(response));
    }

    return response.json();
}

async function loadDocuments() {
    elements.refreshDocumentsButton.disabled = true;
    elements.documentsList.replaceChildren(
        createEmptyPanel("正在加载文档列表...")
    );

    try {
        const data = await fetchJson(`${API_BASE}/documents/`);
        latestDocuments = normalizeArray(data)
            .map(normalizeDocument)
            .sort((left, right) => dateValue(right.createdAt) - dateValue(left.createdAt));
        renderDocuments();
        renderDashboardDocuments();
        return latestDocuments;
    } catch (error) {
        latestDocuments = [];
        renderDocuments();
        renderDashboardDocuments();
        showError(`文档列表加载失败：${getFriendlyError(error)}`);
        return [];
    } finally {
        elements.refreshDocumentsButton.disabled = false;
    }
}

function renderDocuments() {
    const keyword = elements.documentSearchInput.value.trim().toLowerCase();
    const statusFilter = elements.documentStatusFilter.value;
    const documents = latestDocuments.filter((doc) => {
        const matchesKeyword = !keyword || doc.fileName.toLowerCase().includes(keyword);
        const matchesStatus = statusFilter === "ALL" || doc.status === statusFilter;
        return matchesKeyword && matchesStatus;
    });

    const selectionIsVisible = documents.some(
        (doc) => String(doc.docId) === String(selectedDocumentId)
    );
    if (documents.length === 0) {
        selectedDocumentId = null;
    } else if (!selectionIsVisible) {
        selectedDocumentId = documents[0].docId;
    }

    elements.documentsList.innerHTML = "";
    elements.documentResultCount.textContent = `${documents.length} 个文档`;
    renderDocumentDetail();

    if (documents.length === 0) {
        elements.documentsList.appendChild(
            createEmptyPanel(
                latestDocuments.length === 0
                    ? "暂无文档。上传 PDF 或 TXT 后，文档会显示在这里。"
                    : "没有符合当前搜索和筛选条件的文档。"
            )
        );
        return;
    }

    documents.forEach((doc) => {
        const row = document.createElement("article");
        row.className = "document-row";
        const selected = String(doc.docId) === String(selectedDocumentId);
        row.classList.toggle("selected", selected);
        row.setAttribute("aria-selected", String(selected));
        row.tabIndex = 0;
        row.addEventListener("click", (event) => {
            if (!event.target.closest("button")) {
                selectDocument(doc.docId);
            }
        });
        row.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.target.closest("button")) {
                selectDocument(doc.docId);
            }
        });

        const file = document.createElement("div");
        file.className = "document-file";
        file.append(
            createTextElement("div", "document-title", doc.fileName),
            createTextElement(
                "div",
                "document-id",
                isMeaningful(doc.docId) ? `doc_id ${doc.docId}` : "doc_id 暂无"
            )
        );

        const actions = document.createElement("div");
        actions.className = "document-actions";
        actions.append(
            createButton("查看", "small-button", () => selectDocument(doc.docId)),
            createButton("重试", "small-button", () => retryDocument(doc.docId), doc.status !== "FAILED"),
            createButton("删除", "small-button danger", () => deleteDocument(doc.docId, doc.fileName))
        );

        row.append(
            file,
            createTextElement("span", "document-cell", doc.type),
            createTextElement("span", "document-cell", formatFileSize(doc.fileSize)),
            createStatusBadge(getDocumentStatusText(doc.status), getDocumentStatusClass(doc.status)),
            createTextElement(
                "span",
                "document-cell",
                isMeaningful(doc.chunkCount) ? String(doc.chunkCount) : "-"
            ),
            createTextElement("span", "document-cell", formatDate(doc.createdAt)),
            actions
        );
        elements.documentsList.appendChild(row);
    });
}

function renderDashboardDocuments() {
    elements.dashboardDocumentCount.textContent = String(latestDocuments.length);
    elements.dashboardSuccessCount.textContent = String(
        latestDocuments.filter((doc) => doc.status === "SUCCESS").length
    );

    const knownChunks = latestDocuments
        .map((doc) => Number(doc.chunkCount))
        .filter(Number.isFinite);
    elements.dashboardChunkCount.textContent = knownChunks.length
        ? String(knownChunks.reduce((sum, value) => sum + value, 0))
        : "暂无统计";

    elements.dashboardRecentDocuments.innerHTML = "";
    const recent = latestDocuments.slice(0, 5);

    if (recent.length === 0) {
        elements.dashboardRecentDocuments.appendChild(
            createEmptyPanel("暂无文档。")
        );
        return;
    }

    recent.forEach((doc) => {
        const row = document.createElement("div");
        row.className = "compact-row";
        row.append(
            createTextElement("strong", "", doc.fileName),
            createStatusBadge(getDocumentStatusText(doc.status), getDocumentStatusClass(doc.status)),
            createTextElement("span", "", formatDate(doc.createdAt)),
            createTextElement(
                "span",
                "",
                isMeaningful(doc.chunkCount) ? String(doc.chunkCount) : "-"
            )
        );
        elements.dashboardRecentDocuments.appendChild(row);
    });
}

function selectDocument(docId) {
    selectedDocumentId = docId;
    renderDocuments();
}

function renderDocumentDetail() {
    const doc = latestDocuments.find(
        (item) => String(item.docId) === String(selectedDocumentId)
    );
    elements.documentDetailContent.innerHTML = "";

    if (!doc) {
        elements.documentDetailContent.appendChild(
            createCenteredEmpty("icon-file", "请选择文档", "点击文档行可查看当前可用的元数据。")
        );
        return;
    }

    const list = document.createElement("div");
    list.className = "detail-list";
    [
        ["文件名", doc.fileName],
        ["文档 ID", doc.docId],
        ["文件类型", doc.type],
        ["文件大小", formatFileSize(doc.fileSize)],
        ["解析状态", getDocumentStatusText(doc.status)],
        ["Chunks", isMeaningful(doc.chunkCount) ? doc.chunkCount : "暂无统计"],
        ["上传时间", formatDate(doc.createdAt)]
    ].forEach(([label, value]) => {
        const row = document.createElement("div");
        row.className = "detail-row";
        row.append(
            createTextElement("span", "", label),
            createTextElement("strong", "", String(value ?? "-"))
        );
        list.appendChild(row);
    });

    elements.documentDetailContent.append(
        list,
        createTextElement(
            "div",
            "detail-note",
            "原文读取接口当前未开放；此处只展示后端真实返回的文档元数据。"
        )
    );
}

function handleFileSelection() {
    const file = elements.fileInput.files && elements.fileInput.files[0];
    elements.selectedFileName.textContent = file
        ? `${file.name} · ${formatFileSize(file.size)}`
        : "支持 PDF、TXT；上传后由 Celery 异步解析。";

    if (file && fileSelectionOrigin === "playground") {
        uploadDocument();
    }
}

async function uploadDocument() {
    const file = elements.fileInput.files && elements.fileInput.files[0];

    if (!file) {
        showError("请先选择一个 PDF 或 TXT 文档。");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setUploadLoading(true, file.name);

    try {
        const data = await fetchJson(`${API_BASE}/documents/upload`, {
            method: "POST",
            body: formData
        });
        renderKeyValues(elements.uploadResult, [
            ["doc_id", firstMeaningful(data.doc_id, data.id)],
            ["文件", firstMeaningful(data.file_name, file.name)],
            ["状态", getDocumentStatusText(firstMeaningful(data.status, "PENDING"))],
            ["说明", firstMeaningful(data.msg, data.message, "已加入解析队列")]
        ]);
        elements.composerHint.textContent = `${file.name} 已加入异步解析队列`;
        showNotice("文档上传成功，解析任务已派发。");
        elements.fileInput.value = "";
        elements.selectedFileName.textContent = "支持 PDF、TXT；上传后由 Celery 异步解析。";
        await loadDocuments();
    } catch (error) {
        elements.uploadResult.textContent = `上传失败：${getFriendlyError(error)}`;
        elements.composerHint.textContent = "文档上传失败";
        showError(`文档上传失败：${getFriendlyError(error)}`);
    } finally {
        setUploadLoading(false);
    }
}

function setUploadLoading(isLoading, fileName = "") {
    elements.uploadButton.disabled = isLoading;
    elements.chooseFileButton.disabled = isLoading;
    elements.attachmentButton.disabled = isLoading;
    elements.uploadButton.textContent = isLoading ? "上传中..." : "上传文档";

    if (isLoading) {
        elements.uploadResult.textContent = `正在上传 ${fileName}...`;
        elements.composerHint.textContent = `正在上传 ${fileName}...`;
    }
}

async function retryDocument(docId) {
    if (!isMeaningful(docId)) {
        showError("当前文档缺少 doc_id，无法重试。");
        return;
    }

    try {
        const data = await fetchJson(
            `${API_BASE}/documents/${encodeURIComponent(docId)}/retry`,
            { method: "POST" }
        );
        showNotice(data.message || `文档 ${docId} 已重新加入解析队列。`);
        await loadDocuments();
    } catch (error) {
        showError(`重新解析失败：${getFriendlyError(error)}`);
    }
}

async function deleteDocument(docId, fileName) {
    if (!isMeaningful(docId)) {
        showError("当前文档缺少 doc_id，无法删除。");
        return;
    }

    const confirmed = window.confirm(
        `确定删除文档“${fileName}”吗？系统会同时尝试删除原文件和检索片段。`
    );
    if (!confirmed) {
        return;
    }

    try {
        const data = await fetchJson(
            `${API_BASE}/documents/${encodeURIComponent(docId)}`,
            { method: "DELETE" }
        );
        if (String(selectedDocumentId) === String(docId)) {
            selectedDocumentId = null;
        }
        showNotice(data.msg || "文档删除成功。");
        await loadDocuments();
    } catch (error) {
        showError(`文档删除失败：${getFriendlyError(error)}`);
    }
}

async function loadRecentTaskLogs() {
    elements.refreshPipelineButton.disabled = true;
    elements.pipelineTaskList.replaceChildren(
        createEmptyPanel("正在读取最近解析任务...")
    );

    try {
        if (latestDocuments.length === 0) {
            await loadDocuments();
        }

        const candidates = latestDocuments.slice(0, 8);
        const responses = await Promise.allSettled(
            candidates
                .filter((doc) => isMeaningful(doc.docId))
                .map(async (doc) => ({
                    doc,
                    logs: normalizeArray(
                        await fetchJson(
                            `${API_BASE}/documents/${encodeURIComponent(doc.docId)}/task-log`
                        )
                    )
                }))
        );

        const logs = responses
            .filter((result) => result.status === "fulfilled")
            .flatMap((result) => result.value.logs.map((log) => ({
                ...log,
                file_name: result.value.doc.fileName
            })))
            .sort((left, right) => dateValue(right.created_at) - dateValue(left.created_at))
            .slice(0, 20);
        renderPipelineLogs(logs);
    } catch (error) {
        renderPipelineLogs([]);
        showError(`解析任务读取失败：${getFriendlyError(error)}`);
    } finally {
        elements.refreshPipelineButton.disabled = false;
    }
}

function renderPipelineLogs(logs) {
    elements.pipelineTaskList.innerHTML = "";
    elements.pipelineTaskCount.textContent = `${logs.length} 条`;

    if (logs.length === 0) {
        elements.pipelineTaskList.appendChild(
            createEmptyPanel("暂无解析任务。上传文档后，解析流水线会显示在这里。")
        );
        return;
    }

    logs.forEach((log) => {
        const row = document.createElement("div");
        row.className = "pipeline-row";
        const status = String(log.status || "UNKNOWN").toUpperCase();
        row.append(
            createTextElement("strong", "", isMeaningful(log.id) ? String(log.id) : "-"),
            createTextElement("strong", "", String(log.file_name || "未命名文档")),
            createStatusBadge(getTaskStatusText(status), getTaskStatusClass(status)),
            createTextElement("span", "", formatDate(log.created_at)),
            createTextElement("span", "", formatDuration(log.created_at, log.updated_at)),
            createTextElement(
                "span",
                "pipeline-error",
                String(log.error_message || log.message || "暂无补充信息")
            )
        );
        elements.pipelineTaskList.appendChild(row);
    });
}

async function askQuestion() {
    if (elements.askButton.disabled) {
        return;
    }

    const question = elements.questionInput.value.trim();
    if (!question) {
        showError("请输入问题后再发送。");
        elements.questionInput.focus();
        return;
    }

    setView("playground");
    elements.emptyState.classList.add("hidden");
    appendUserMessage(question);
    const assistant = createAssistantMessage();
    const startedAt = performance.now();

    elements.questionInput.value = "";
    resizeQuestionInput();
    setAskLoading(true);
    elements.composerHint.textContent = "正在判断意图并准备回答...";
    scrollChatToBottom();

    try {
        const data = await fetchJson(`${API_BASE}/search/ask`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question })
        });
        const response = normalizeAnswerResponse(data);
        response.latencyMs = performance.now() - startedAt;

        assistant.answer.classList.remove("loading");
        renderLimitedMarkdown(response.answer, assistant.answer);
        updateAssistantState(assistant, response);
        answerEvidenceById.set(assistant.answerId, {
            answerType: response.answerType,
            sources: response.sources
        });
        selectAssistantAnswer(assistant.answerId);
        elements.composerHint.textContent = getComposerResultText(response);
    } catch (error) {
        assistant.answer.classList.remove("loading");
        assistant.answer.classList.add("error");
        assistant.answer.textContent = "本次问答没有完成。请检查文档解析状态和系统依赖后重试。";
        assistant.state.className = "answer-state unanswerable";
        assistant.state.textContent = "请求失败";
        assistant.citation.textContent = "未生成有效引用";
        assistant.latency.textContent = `${Math.round(performance.now() - startedAt)} ms`;
        answerEvidenceById.set(assistant.answerId, {
            answerType: "error",
            sources: []
        });
        selectAssistantAnswer(assistant.answerId);
        elements.composerHint.textContent = "问答失败，请检查系统状态";
        showError(`问答请求失败：${getFriendlyError(error)}`);
    } finally {
        setAskLoading(false);
        scrollChatToBottom();
    }
}

function appendUserMessage(question) {
    const message = document.createElement("div");
    message.className = "message message-user";
    message.appendChild(createTextElement("div", "user-bubble", question));
    elements.chatMessages.appendChild(message);
}

function createAssistantMessage() {
    const answerId = `answer-${++answerSequence}`;
    const wrapper = document.createElement("div");
    wrapper.className = "message";
    const card = document.createElement("article");
    card.className = "assistant-message";
    card.dataset.answerId = answerId;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-pressed", "false");
    card.setAttribute("aria-label", `查看第 ${answerSequence} 条助手回答的引用证据`);
    card.title = "点击查看这条回答的引用证据";
    card.addEventListener("click", () => selectAssistantAnswer(answerId));
    card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectAssistantAnswer(answerId);
        }
    });

    const head = document.createElement("div");
    head.className = "assistant-head";
    const identity = document.createElement("div");
    identity.className = "assistant-identity";
    identity.append(
        createTextElement("span", "assistant-avatar", "RB"),
        createTextElement("span", "", "RAG Builder")
    );
    const state = createTextElement("span", "answer-state loading", "生成中");
    head.append(identity, state);

    const answer = createTextElement("div", "assistant-answer loading", "正在生成回答...");
    const foot = document.createElement("div");
    foot.className = "assistant-foot";
    const citation = createTextElement("span", "", "等待引用");
    const latency = createTextElement("strong", "", "-");
    foot.append(citation, createTextElement("span", "", "·"), latency);

    card.append(head, answer, foot);
    wrapper.appendChild(card);
    elements.chatMessages.appendChild(wrapper);
    answerEvidenceById.set(answerId, {
        answerType: "loading",
        sources: []
    });
    selectAssistantAnswer(answerId);
    return { answerId, card, answer, state, citation, latency };
}

function selectAssistantAnswer(answerId) {
    const evidence = answerEvidenceById.get(answerId);
    if (!evidence) {
        return;
    }

    selectedAnswerId = answerId;
    document.querySelectorAll(".assistant-message[data-answer-id]").forEach((card) => {
        const selected = card.dataset.answerId === answerId;
        card.classList.toggle("selected", selected);
        card.setAttribute("aria-pressed", String(selected));
    });
    renderEvidence(evidence.sources, evidence.answerType);
}

function normalizeAnswerResponse(data) {
    const answer = String(data?.answer ?? data?.result ?? "后端没有返回可展示的回答。");
    const rawSources = Array.isArray(data?.citations)
        ? data.citations
        : Array.isArray(data?.sources)
            ? data.sources
            : Array.isArray(data?.chunks)
                ? data.chunks
                : [];
    let answerType = String(data?.answer_type || "").toLowerCase();
    const usedRetrieval = typeof data?.used_retrieval === "boolean"
        ? data.used_retrieval
        : answerType !== "chitchat";

    if (!answerType) {
        answerType = !usedRetrieval
            ? "chitchat"
            : isNoAnswerText(answer)
                ? "unanswerable"
                : "grounded";
    }
    if (isNoAnswerText(answer)) {
        answerType = "unanswerable";
    }

    const sources = answerType === "grounded"
        ? rawSources.map(normalizeSource).filter(isUsefulSource)
        : [];
    return { answer, answerType, usedRetrieval, sources };
}

function updateAssistantState(message, response) {
    const state = getAnswerState(response.answerType);
    message.state.className = `answer-state ${state.className}`;
    message.state.textContent = state.label;
    message.latency.textContent = `${Math.round(response.latencyMs)} ms`;

    if (response.answerType === "grounded") {
        message.citation.textContent = `已检索 · ${response.sources.length} 条有效引用`;
    } else if (response.answerType === "chitchat") {
        message.citation.textContent = "普通回复 · 未使用知识库检索";
    } else {
        message.citation.textContent = "已检索 · 0 条达到引用阈值";
    }
}

function renderEvidence(sources, answerType) {
    const items = normalizeArray(sources).map(normalizeSource).filter(isUsefulSource);
    const state = getAnswerState(answerType);

    elements.evidenceStatus.className = `answer-state ${state.className}`;
    elements.evidenceStatus.textContent = state.label;
    elements.evidenceCount.textContent = `${items.length} 条`;
    elements.headerEvidenceCount.textContent = String(items.length);
    elements.evidenceContent.innerHTML = "";

    if (items.length === 0) {
        const copy = {
            loading: ["正在生成回答", "回答完成后将同步显示当前回答的引用证据。"],
            chitchat: ["未触发知识库检索", "这是普通助手回复，未触发知识库检索。"],
            unanswerable: ["没有可展示的证据", "未找到达到引用阈值的证据，因此未展示来源。"],
            error: ["证据获取失败", "本次请求未完成，没有生成可核对的引用。"],
            neutral: ["尚无引用证据", "当前回答没有使用知识库引用。"]
        }[answerType] || ["当前回答没有引用", "当前回答没有使用知识库引用。"];
        elements.evidenceContent.appendChild(
            createCenteredEmpty("icon-panel", copy[0], copy[1])
        );
        return;
    }

    const list = document.createElement("div");
    list.className = "source-list";
    items.forEach((source, index) => list.appendChild(createSourceCard(source, index)));
    elements.evidenceContent.appendChild(list);
}

function createSourceCard(source, index) {
    const details = document.createElement("details");
    details.className = "source-item";
    details.open = index === 0;

    const summary = document.createElement("summary");
    const heading = document.createElement("span");
    heading.className = "source-heading";
    heading.append(
        createTextElement("span", "source-title", source.fileName || "未知来源"),
        createTextElement("span", "source-subtitle", getSourceSubtitle(source, index))
    );
    const scoreEntries = getSourceScoreEntries(source);
    const primaryScore = scoreEntries[0];
    summary.append(
        heading,
        createTextElement(
            "span",
            "source-score",
            primaryScore
                ? `${primaryScore[0]} ${formatScore(primaryScore[1])}`
                : `#${index + 1}`
        )
    );

    const body = document.createElement("div");
    body.className = "source-body";
    const meta = document.createElement("div");
    meta.className = "source-meta";
    appendMetaIfPresent(meta, "doc_id", source.docId);
    appendMetaIfPresent(meta, "chunk_id", source.chunkId);
    appendMetaIfPresent(meta, "page", source.pageNumber);
    const scores = document.createElement("div");
    scores.className = "score-strip";
    scoreEntries.forEach(([label, value]) => {
        appendScoreIfPresent(scores, label, value);
    });
    body.append(meta);
    if (scores.childElementCount > 1) {
        body.appendChild(scores);
    }
    body.appendChild(
        createTextElement(
            "div",
            "source-text",
            truncate(source.chunkText, 1600) || "暂无片段预览"
        )
    );
    details.append(summary, body);
    return details;
}

function getSourceSubtitle(source, index) {
    const parts = [];
    if (isMeaningful(source.pageNumber)) parts.push(`第 ${source.pageNumber} 页`);
    if (isMeaningful(source.chunkId)) parts.push(`chunk ${source.chunkId}`);
    return parts.length ? parts.join(" · ") : `来源片段 ${index + 1}`;
}

function getSourceScoreEntries(source) {
    return [
        ["Score", source.score],
        ["Hybrid", source.hybridScore],
        ["Vector", source.vectorScore],
        ["Keyword", source.keywordScore],
        ["Rerank", source.rerankScore]
    ].filter(([, value]) => isMeaningful(value) && Number.isFinite(Number(value)));
}

function setAskLoading(isLoading) {
    elements.askButton.disabled = isLoading;
    elements.askButton.classList.toggle("loading", isLoading);
    elements.attachmentButton.disabled = isLoading;
}

function getComposerResultText(response) {
    if (response.answerType === "chitchat") {
        return "普通回复完成 · 未调用知识库检索";
    }
    if (response.answerType === "unanswerable") {
        return "未找到足够证据 · 未展示来源";
    }
    return `回答完成 · ${response.sources.length} 条有效引用`;
}

async function runRetrievalTest() {
    const query = elements.retrievalQueryInput.value.trim();
    const topK = Math.max(1, Math.min(20, Number(elements.retrievalTopKInput.value) || 5));
    const useRerank = elements.retrievalRerankInput.value === "true";

    if (!query) {
        showError("请输入要测试的检索 query。");
        elements.retrievalQueryInput.focus();
        return;
    }

    elements.runRetrievalButton.disabled = true;
    elements.runRetrievalButton.classList.add("is-loading");
    elements.retrievalResults.replaceChildren(
        createEmptyPanel("正在执行 Embedding 与 Hybrid 检索...")
    );
    elements.retrievalLatency.textContent = "运行中";
    elements.retrievalRerankStatus.textContent = useRerank ? "尝试 Rerank" : "Rerank 未启用";

    try {
        const params = new URLSearchParams({
            query,
            top_k: String(topK),
            use_rerank: String(useRerank)
        });
        const data = await fetchJson(`${API_BASE}/retrieval/test?${params.toString()}`);
        renderRetrievalResults(data);
    } catch (error) {
        elements.retrievalResults.replaceChildren(
            createCenteredEmpty(
                "icon-search",
                "检索测试未完成",
                "请检查 Embedding 与 Elasticsearch 状态后重试。"
            )
        );
        elements.retrievalLatency.textContent = "运行失败";
        elements.retrievalRerankStatus.textContent = "状态未知";
        showError(`检索测试失败：${getFriendlyError(error)}`);
    } finally {
        elements.runRetrievalButton.disabled = false;
        elements.runRetrievalButton.classList.remove("is-loading");
    }
}

function renderRetrievalResults(data) {
    const results = normalizeArray(data?.results);
    elements.retrievalLatency.textContent = `${formatNumber(data?.latency_ms, 2)} ms`;
    elements.retrievalRerankStatus.textContent = getRerankStatusText(data?.rerank_status);
    elements.retrievalRerankStatus.title = data?.rerank_message || "";
    elements.retrievalResults.innerHTML = "";

    if (results.length === 0) {
        elements.retrievalResults.appendChild(
            createCenteredEmpty("icon-search", "没有召回结果", "当前 query 未召回可展示的 chunk。")
        );
        return;
    }

    results.forEach((item, index) => {
        const details = document.createElement("details");
        details.className = "retrieval-result";
        details.open = index === 0;
        const summary = document.createElement("summary");
        const title = document.createElement("div");
        title.className = "retrieval-result-title";
        const resultSource = normalizeSource(item);
        title.append(
            createTextElement("span", "retrieval-rank", `#${item.rank || index + 1}`),
            createTextElement("strong", "", resultSource.fileName)
        );
        summary.append(
            title,
            createTextElement(
                "span",
                "source-score",
                isMeaningful(item.score) ? formatScore(item.score) : "score -"
            )
        );

        const body = document.createElement("div");
        body.className = "source-body";
        const meta = document.createElement("div");
        meta.className = "source-meta";
        appendMetaIfPresent(meta, "doc_id", item.doc_id);
        appendMetaIfPresent(meta, "chunk_id", item.chunk_id);
        appendMetaIfPresent(meta, "page", item.page_number);

        const scores = document.createElement("div");
        scores.className = "score-strip";
        appendScoreIfPresent(scores, "Score", item.score);
        appendScoreIfPresent(scores, "Hybrid", item.hybrid_score);
        appendScoreIfPresent(scores, "Vector", item.vector_score);
        appendScoreIfPresent(scores, "Keyword", item.keyword_score);
        appendScoreIfPresent(scores, "Rerank", item.rerank_score);

        body.append(meta);
        if (scores.childElementCount) body.appendChild(scores);
        body.appendChild(
            createTextElement(
                "div",
                "retrieval-preview",
                truncate(String(item.chunk_text || ""), 2200) || "该结果未返回 chunk_text。"
            )
        );
        details.append(summary, body);
        elements.retrievalResults.appendChild(details);
    });
}

async function loadEvaluation() {
    elements.refreshEvaluationButton.disabled = true;

    try {
        latestEvaluation = await fetchJson(`${API_BASE}/eval/report`);
        renderEvaluation(latestEvaluation);
    } catch (error) {
        latestEvaluation = {
            available: false,
            message: "评测报告暂时无法读取，请运行评测命令后刷新。"
        };
        renderEvaluation(latestEvaluation);
    } finally {
        elements.refreshEvaluationButton.disabled = false;
    }
}

function renderEvaluation(data) {
    const retrieval = data?.retrieval || {};
    const answer = data?.answer || {};
    const baseline = retrieval?.baseline || {};
    const metrics = {
        hit_rate: formatPercent(baseline.hit_rate_at_k),
        recall: formatPercent(baseline.recall_at_k),
        precision: formatPercent(baseline.precision_at_k),
        mrr: formatPercent(baseline.mrr),
        claim_hit: formatPercent(answer.expected_claim_hit_rate),
        unsupported: isMeaningful(answer.unsupported_claim_count)
            ? String(answer.unsupported_claim_count)
            : "-",
        abstention: formatPercent(answer.unanswerable_abstention_rate),
        rerank: getRerankStatusText(retrieval.rerank_status)
    };

    Object.entries(metrics).forEach(([name, value]) => {
        const target = document.querySelector(`[data-metric="${name}"]`);
        if (target) target.textContent = value;
    });

    elements.evaluationGeneratedAt.textContent = data?.generated_at
        ? formatDate(data.generated_at)
        : "尚未生成";
    elements.evaluationMessage.textContent = data?.message || "暂无评测报告。";
    renderEvaluationFailures(normalizeArray(data?.failures));
    renderDashboardEvaluation(data);
}

function renderDashboardEvaluation(data) {
    const retrieval = data?.retrieval || {};
    const answer = data?.answer || {};
    const baseline = retrieval?.baseline || {};
    const values = [
        ["Hit Rate", formatPercent(baseline.hit_rate_at_k)],
        ["Recall", formatPercent(baseline.recall_at_k)],
        ["Precision", formatPercent(baseline.precision_at_k)],
        ["MRR", formatPercent(baseline.mrr)],
        ["Claim Hit", formatPercent(answer.expected_claim_hit_rate)],
        [
            "Unsupported",
            isMeaningful(answer.unsupported_claim_count)
                ? String(answer.unsupported_claim_count)
                : "-"
        ]
    ];

    elements.dashboardEvalMetrics.innerHTML = "";
    values.forEach(([label, value]) => {
        const item = document.createElement("div");
        item.append(
            createTextElement("span", "", label),
            createTextElement("strong", "", value)
        );
        elements.dashboardEvalMetrics.appendChild(item);
    });

    const answerCaseCount = Number(answer.answer_case_count);
    const answerFailures = new Set(
        normalizeArray(answer.failures)
            .map((failure) => failure.case_id)
            .filter(isMeaningful)
    ).size;
    elements.dashboardEvalRate.textContent = Number.isFinite(answerCaseCount) && answerCaseCount > 0
        ? formatPercent(Math.max(0, answerCaseCount - answerFailures) / answerCaseCount)
        : "暂无评测数据";
    elements.dashboardEvalSource.textContent = data?.available
        ? "基于最近一次 eval_report.md 统计"
        : "暂无评测数据";
    elements.dashboardEvalFallback.classList.toggle("hidden", Boolean(data?.available));
}

function renderEvaluationFailures(failures) {
    elements.evaluationFailureList.innerHTML = "";
    elements.evaluationFailureCount.textContent = `${failures.length} 条`;

    if (failures.length === 0) {
        elements.evaluationFailureList.appendChild(
            createEmptyPanel("暂无失败用例。")
        );
        return;
    }

    failures.forEach((failure) => {
        const row = document.createElement("div");
        row.className = "failure-row";
        row.append(
            createTextElement("strong", "", String(failure.case_id || "-")),
            createTextElement("span", "", String(failure.query || "-")),
            createTextElement(
                "span",
                "",
                String(failure.failure_reason || failure.reason || "未提供失败原因")
            )
        );
        elements.evaluationFailureList.appendChild(row);
    });
}

async function loadSystemStatus() {
    setHealthLoading(true);

    try {
        latestSystemStatus = await fetchJson(`${API_BASE}/system/status`);
    } catch (consoleError) {
        latestSystemStatus = await loadLegacySystemStatus();
    }

    renderSystemStatus(latestSystemStatus);
    setHealthLoading(false);
}

async function loadLegacySystemStatus() {
    const [apiResult, dependencyResult] = await Promise.allSettled([
        fetchJson(`${API_BASE}/health`),
        fetchJson(`${API_BASE}/health/dependencies`)
    ]);
    const components = {};

    components.fastapi = apiResult.status === "fulfilled"
        ? { name: "FastAPI", status: "ok", message: "FastAPI 健康接口可响应" }
        : { name: "FastAPI", status: "error", message: "FastAPI 健康接口不可用" };

    if (dependencyResult.status === "fulfilled") {
        const dependencies = dependencyResult.value?.dependencies || {};
        Object.entries(dependencies).forEach(([key, value]) => {
            components[key.toLowerCase()] = {
                name: value?.name || key,
                status: value?.status || "unknown",
                message: value?.message || "当前没有可用状态"
            };
        });
    }

    HEALTH_ORDER.forEach((key) => {
        if (!components[key]) {
            components[key] = {
                name: getComponentName(key),
                status: "unknown",
                message: "当前接口没有返回该组件状态"
            };
        }
    });

    const runtime = HEALTH_ORDER.map((key) => components[key].status);
    return {
        status: runtime.every(
            (status) => ["ok", "configured", "disabled"].includes(status)
        ) ? "ok" : "degraded",
        components,
        retrieval: {}
    };
}

function setHealthLoading(isLoading) {
    elements.refreshHealthButton.disabled = isLoading;
    elements.sidebarRefreshStatus.disabled = isLoading;
    if (isLoading) {
        elements.overallHealth.className = "status-badge neutral";
        elements.overallHealth.textContent = "检查中";
    }
}

function renderSystemStatus(data) {
    const components = data?.components || {};
    const overall = String(data?.status || "unknown").toLowerCase();
    elements.healthGrid.innerHTML = "";

    HEALTH_ORDER.forEach((key) => {
        const component = findComponent(components, key);
        const card = document.createElement("article");
        card.className = "health-card";
        card.append(
            createTextElement("h3", "", component.name || getComponentName(key)),
            createStatusBadge(
                getDependencyStatusText(component.status),
                getHealthStatusClass(component.status)
            ),
            createTextElement("p", "", component.message || "当前没有可用状态")
        );
        if (isMeaningful(component.model)) {
            card.appendChild(
                createTextElement("div", "health-model", `model: ${component.model}`)
            );
        }
        elements.healthGrid.appendChild(card);
    });

    elements.overallHealth.className = `status-badge ${getHealthStatusClass(overall)}`;
    elements.overallHealth.textContent = getOverallHealthText(overall);
    elements.globalStatusDot.className = `status-dot ${getHealthDotClass(overall)}`;
    elements.globalStatusText.textContent = `系统状态${getOverallHealthText(overall)}`;
    elements.sidebarOverallDot.className = `status-dot ${getHealthDotClass(overall)}`;
    elements.sidebarOverallText.textContent = `系统${getOverallHealthText(overall)}`;

    renderSidebarHealth(components, data?.api_port);
    renderRetrievalConfiguration(data?.retrieval || {});
}

function renderSidebarHealth(components, apiPort) {
    elements.sidebarHealthList.innerHTML = "";
    SIDEBAR_HEALTH_ORDER.forEach((key) => {
        const component = findComponent(components, key);
        const item = document.createElement("div");
        item.className = "mini-status";
        const label = key === "fastapi"
            ? getFastApiRuntimeLabel(apiPort)
            : component.name || getComponentName(key);
        item.append(
            createTextElement("span", `status-dot ${getHealthDotClass(component.status)}`, ""),
            createTextElement("span", "", label),
            createTextElement("b", "", getDependencyStatusText(component.status))
        );
        elements.sidebarHealthList.appendChild(item);
    });
}

function getFastApiRuntimeLabel(apiPort) {
    const currentPort = window.location.port;
    if (currentPort) {
        return `FastAPI :${currentPort}`;
    }
    if (isMeaningful(apiPort)) {
        return `FastAPI :${apiPort}`;
    }
    return "FastAPI 当前连接";
}

function renderRetrievalConfiguration(config) {
    elements.playgroundMode.textContent = config.mode || "Hybrid";
    elements.playgroundTopK.textContent = isMeaningful(config.top_k)
        ? String(config.top_k)
        : "5";
    elements.playgroundRerank.textContent = config.rerank_enabled ? "已启用" : "未启用";
    elements.playgroundThreshold.textContent = isMeaningful(config.citation_threshold)
        ? Number(config.citation_threshold).toFixed(2)
        : "0.60";
}

function toggleContextPanel() {
    const open = document.body.classList.toggle("context-open");
    elements.evidenceToggle.setAttribute("aria-expanded", String(open));
}

function closeContextPanel() {
    document.body.classList.remove("context-open");
    elements.evidenceToggle.setAttribute("aria-expanded", "false");
}

function closeSidebar() {
    document.body.classList.remove("sidebar-open");
}

function resizeQuestionInput() {
    elements.questionInput.style.height = "auto";
    elements.questionInput.style.height = `${Math.min(elements.questionInput.scrollHeight, 168)}px`;
}

function scrollChatToBottom() {
    window.setTimeout(() => {
        elements.chatScroll.scrollTop = elements.chatScroll.scrollHeight;
    }, 0);
}

function renderLimitedMarkdown(text, container) {
    container.innerHTML = "";
    const lines = String(text || "").split(/\r?\n/);
    let list = null;

    lines.forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) {
            list = null;
            return;
        }

        const listMatch = line.match(/^(\d+)[.、]\s*(.+)$/);
        if (listMatch) {
            if (!list) {
                list = document.createElement("ol");
                container.appendChild(list);
            }
            const item = document.createElement("li");
            appendInlineMarkdown(item, listMatch[2]);
            list.appendChild(item);
            return;
        }

        list = null;
        const paragraph = document.createElement("p");
        appendInlineMarkdown(paragraph, line.replace(/^[-*]\s+/, ""));
        container.appendChild(paragraph);
    });

    if (!container.childElementCount) {
        container.textContent = String(text || "");
    }
}

function appendInlineMarkdown(container, text) {
    const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
    parts.forEach((part) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            container.appendChild(
                createTextElement("strong", "", part.slice(2, -2))
            );
        } else if (part) {
            container.appendChild(document.createTextNode(part));
        }
    });
}

function normalizeArray(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.documents)) return value.documents;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.results)) return value.results;
    return [];
}

function normalizeDocument(doc) {
    const fileName = String(
        firstMeaningful(doc?.file_name, doc?.filename, doc?.name, "未命名文档")
    );
    return {
        docId: firstMeaningful(doc?.doc_id, doc?.id, doc?.document_id),
        fileName,
        type: getFileType(fileName),
        status: String(doc?.status || "UNKNOWN").toUpperCase(),
        createdAt: firstMeaningful(doc?.created_at, doc?.createdAt),
        chunkCount: firstMeaningful(doc?.chunk_count, doc?.chunkCount),
        fileSize: firstMeaningful(doc?.file_size, doc?.fileSize, doc?.size)
    };
}

function normalizeSource(source) {
    const item = source && typeof source === "object" ? source : {};
    const metadata = item.metadata && typeof item.metadata === "object"
        ? item.metadata
        : {};
    const docId = firstMeaningful(
        item.doc_id,
        item.document_id,
        item.source_id,
        item.id,
        metadata.doc_id,
        metadata.document_id
    );
    const chunkId = firstMeaningful(
        item.chunk_id,
        item.chunkId,
        metadata.chunk_id
    );
    const explicitName = normalizeSourceName(firstMeaningful(
        item.document_name,
        item.filename,
        item.file_name,
        item.doc_name,
        item.source_name,
        metadata.filename,
        metadata.document_name,
        metadata.file_name
    ));
    return {
        docId,
        fileName: explicitName || buildSourceFallback(docId, chunkId),
        chunkId,
        pageNumber: firstMeaningful(
            item.page_number,
            item.page,
            item.pageNumber,
            metadata.page_number,
            metadata.page
        ),
        chunkText: String(firstMeaningful(
            item.preview,
            item.text_preview,
            item.content,
            item.chunk_text,
            item.text,
            metadata.preview,
            metadata.text_preview,
            metadata.content,
            metadata.chunk_text,
            metadata.text
        ) ?? ""),
        score: firstMeaningful(item.score, item._score, item.similarity),
        hybridScore: firstMeaningful(item.hybrid_score, item.hybridScore),
        vectorScore: firstMeaningful(item.vector_score, item.vectorScore),
        keywordScore: firstMeaningful(item.keyword_score, item.keywordScore),
        rerankScore: firstMeaningful(
            item.rerank_score,
            item.rerankScore,
            item.semantic_score
        )
    };
}

function normalizeSourceName(value) {
    if (!isMeaningful(value)) {
        return null;
    }
    const normalized = String(value).trim();
    return normalized === "未命名来源" ? null : normalized;
}

function buildSourceFallback(docId, chunkId) {
    if (isMeaningful(chunkId)) {
        const chunkToken = String(chunkId);
        if (chunkToken.startsWith("doc_")) {
            return `来源：${chunkToken}`;
        }
        if (isMeaningful(docId)) {
            const docToken = String(docId).startsWith("doc_")
                ? String(docId)
                : `doc_${docId}`;
            return `来源：${docToken}_${chunkToken}`;
        }
        return `来源：${chunkToken}`;
    }
    if (isMeaningful(docId)) {
        const docToken = String(docId);
        return docToken.startsWith("doc_")
            ? `来源：${docToken}`
            : `来源：doc_${docToken}`;
    }
    return "未知来源";
}

function isUsefulSource(source) {
    return [
        source.docId,
        source.fileName !== "未知来源" ? source.fileName : null,
        source.chunkId,
        source.pageNumber,
        source.chunkText
    ].some(isMeaningful);
}

function getAnswerState(answerType) {
    if (answerType === "grounded") return { label: "已基于知识库生成", className: "grounded" };
    if (answerType === "chitchat") return { label: "普通助手回复", className: "chitchat" };
    if (answerType === "unanswerable") return { label: "未找到足够依据", className: "unanswerable" };
    if (answerType === "error") return { label: "请求失败", className: "unanswerable" };
    if (answerType === "loading") return { label: "生成中", className: "loading" };
    return { label: "等待提问", className: "neutral" };
}

function isNoAnswerText(answer) {
    const text = String(answer || "").replace(/\s+/g, "");
    return [
        "知识库中没有足够依据",
        "知识库中暂无足够依据",
        "没有足够依据回答",
        "无法根据当前知识库",
        "未找到足够"
    ].some((phrase) => text.includes(phrase.replace(/\s+/g, "")));
}

function createStatusBadge(text, statusClass) {
    return createTextElement("span", `status-badge ${statusClass}`, text);
}

function createCenteredEmpty(iconId, title, text) {
    const empty = document.createElement("div");
    empty.className = "empty-panel centered";
    empty.append(
        createSvgIcon(iconId),
        createTextElement("strong", "", title),
        createTextElement("p", "", text)
    );
    return empty;
}

function createEmptyPanel(text) {
    return createTextElement("div", "empty-panel", text);
}

function createTextElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    return element;
}

function createSvgIcon(symbolId) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", `#${symbolId}`);
    svg.appendChild(use);
    return svg;
}

function createButton(text, className, onClick, disabled = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.disabled = disabled;
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        onClick();
    });
    return button;
}

function renderKeyValues(container, rows) {
    container.innerHTML = "";
    const list = document.createElement("div");
    list.className = "kv-list";
    rows.forEach(([key, value]) => {
        if (!isMeaningful(value)) return;
        const row = document.createElement("div");
        row.className = "kv-row";
        row.append(
            createTextElement("span", "kv-key", key),
            createTextElement("span", "kv-value", String(value))
        );
        list.appendChild(row);
    });
    container.appendChild(list);
}

function appendMetaIfPresent(container, key, value) {
    if (isMeaningful(value)) {
        container.appendChild(
            createTextElement("span", "meta-chip", `${key}: ${value}`)
        );
    }
}

function appendScoreIfPresent(container, label, value) {
    if (isMeaningful(value) && Number.isFinite(Number(value))) {
        container.appendChild(
            createTextElement("span", "score-chip", `${label} ${formatScore(value)}`)
        );
    }
}

function findComponent(components, key) {
    if (Array.isArray(components)) {
        return components.find((item) => {
            const name = String(item?.name || item?.key || "").toLowerCase();
            return name === key || name.includes(key);
        }) || { name: getComponentName(key), status: "unknown", message: "当前没有可用状态" };
    }
    return components?.[key]
        || components?.[getComponentName(key)]
        || { name: getComponentName(key), status: "unknown", message: "当前没有可用状态" };
}

function getComponentName(key) {
    return {
        fastapi: "FastAPI",
        postgresql: "PostgreSQL",
        minio: "MinIO",
        redis: "Redis",
        elasticsearch: "Elasticsearch",
        celery: "Celery Worker",
        embedding: "Embedding Model",
        llm: "LLM",
        rerank: "Rerank Model"
    }[key] || key;
}

function getDocumentStatusClass(status) {
    const value = String(status || "").toUpperCase();
    if (value === "SUCCESS") return "success";
    if (value === "FAILED") return "danger";
    if (value === "PARSING") return "info";
    if (value === "PENDING") return "neutral";
    return "warning";
}

function getDocumentStatusText(status) {
    const value = String(status || "").toUpperCase();
    if (value === "SUCCESS") return "解析成功";
    if (value === "FAILED") return "解析失败";
    if (value === "PARSING") return "解析中";
    if (value === "PENDING") return "待解析";
    return "状态未知";
}

function getTaskStatusClass(status) {
    const value = String(status || "").toUpperCase();
    if (value === "SUCCESS") return "success";
    if (value === "FAILED") return "danger";
    if (value === "STARTED") return "info";
    return "neutral";
}

function getTaskStatusText(status) {
    const value = String(status || "").toUpperCase();
    if (value === "SUCCESS") return "成功";
    if (value === "FAILED") return "失败";
    if (value === "STARTED") return "执行中";
    return "状态未知";
}

function getHealthStatusClass(status) {
    const value = String(status || "").toLowerCase();
    if (["ok", "success", "configured"].includes(value)) return "success";
    if (["error", "failed", "fail"].includes(value)) return "danger";
    if (["degraded", "warning"].includes(value)) return "warning";
    if (value === "disabled") return "neutral";
    return "neutral";
}

function getHealthDotClass(status) {
    const value = String(status || "").toLowerCase();
    if (["ok", "success", "configured"].includes(value)) return "ok";
    if (["error", "failed", "fail"].includes(value)) return "error";
    if (["degraded", "warning"].includes(value)) return "warning";
    if (value === "disabled") return "disabled";
    return "unknown";
}

function getDependencyStatusText(status) {
    const value = String(status || "").toLowerCase();
    if (["ok", "success"].includes(value)) return "正常";
    if (value === "configured") return "已配置";
    if (value === "disabled") return "未启用";
    if (["error", "failed", "fail"].includes(value)) return "异常";
    if (["degraded", "warning"].includes(value)) return "部分异常";
    if (value === "checking") return "检查中";
    return "未知";
}

function getOverallHealthText(status) {
    const value = String(status || "").toLowerCase();
    if (value === "ok") return "正常";
    if (value === "degraded") return "部分异常";
    if (value === "error") return "异常";
    return "未知";
}

function getRerankStatusText(status) {
    const value = String(status || "").toLowerCase();
    if (value === "enabled") return "已启用";
    if (value === "disabled") return "未启用";
    if (value === "unavailable") return "不可用";
    if (value === "failed") return "执行失败";
    return isMeaningful(status) ? String(status) : "-";
}

function getFileType(fileName) {
    const suffix = String(fileName).split(".").pop();
    return suffix && suffix !== fileName ? suffix.toUpperCase() : "-";
}

function firstMeaningful(...values) {
    return values.find(isMeaningful);
}

function isMeaningful(value) {
    if (value === undefined || value === null) {
        return false;
    }
    const normalized = String(value).trim();
    return normalized !== ""
        && !["undefined", "null", "nan"].includes(normalized.toLowerCase());
}

function truncate(value, maxLength) {
    const text = String(value || "");
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function dateValue(value) {
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) ? time : 0;
}

function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    });
}

function formatDuration(startValue, endValue) {
    if (!startValue || !endValue) return "-";
    const durationMs = new Date(endValue).getTime() - new Date(startValue).getTime();
    if (!Number.isFinite(durationMs) || durationMs < 0) return "-";
    if (durationMs < 1000) return `${durationMs} ms`;
    if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)} s`;
    return `${(durationMs / 60000).toFixed(1)} min`;
}

function formatFileSize(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatScore(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(4) : String(value);
}

function formatNumber(value, digits = 2) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : "-";
}

function formatPercent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : "-";
}

async function readResponseError(response) {
    try {
        const data = await response.json();
        if (typeof data?.detail === "string") return data.detail;
        if (Array.isArray(data?.detail)) {
            return data.detail.map((item) => item.msg || "请求参数错误").join("；");
        }
        if (typeof data?.message === "string") return data.message;
        if (typeof data?.msg === "string") return data.msg;
    } catch (error) {
        return `${response.status} ${response.statusText || "请求失败"}`;
    }
    return `${response.status} ${response.statusText || "请求失败"}`;
}

function getFriendlyError(error) {
    const message = String(error?.message || "");
    if (!message || message === "Failed to fetch") {
        return "无法连接到本地服务";
    }
    return message;
}

function showError(message) {
    showToast(message, "error");
}

function showNotice(message) {
    showToast(message, "notice");
}

function showToast(message, type) {
    const toast = createTextElement("div", `toast ${type}`, message);
    elements.toastRegion.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4200);
}
