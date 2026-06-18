const API_BASE = "/api/v1";
const PAGE_TITLE = "RAG Builder｜知识库工作台";

const VIEW_META = {
    dashboard: { title: "全部知识库" },
    playground: { title: "RAG 问答" },
    documents: { title: "文档集合" },
    pipeline: { title: "上传解析" },
    retrieval: { title: "检索调试" },
    evaluation: { title: "评测报告" },
    health: { title: "系统状态" }
};

const UPLOAD_HELP_TEXT = "支持 PDF / TXT / Markdown / Word(.docx)。可一次上传多个政策文件、公告文件或项目文档。";
const MAX_UPLOAD_FILES = 10;
const DOCUMENT_POLLING_INTERVAL_MS = 3000;
const DOCUMENT_POLLING_VIEWS = new Set(["dashboard", "documents", "pipeline"]);

const HEALTH_GROUPS = [
    {
        id: "core",
        title: "核心服务",
        description: "决定已有知识库的检索与问答是否可用。",
        keys: ["fastapi", "elasticsearch", "redis", "postgresql"]
    },
    {
        id: "document_processing",
        title: "文档解析服务",
        description: "影响新文档上传、对象读取和异步解析。",
        keys: ["minio", "celery"]
    },
    {
        id: "ai",
        title: "AI 能力",
        description: "Embedding、LLM 与可选的检索重排能力。",
        keys: ["embedding", "llm", "rerank"]
    }
];

const HEALTH_ORDER = HEALTH_GROUPS.flatMap((group) => group.keys);

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
let currentViewName = "dashboard";
let fileSelectionOrigin = "documents";
let selectedUploadItems = [];
let uploadItemSequence = 0;
let uploadInProgress = false;
let documentPollingTimer = null;
let documentPollingInFlight = false;
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
    clearUploadListButton: $("clearUploadListButton"),
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
    dashboardRerankNode: $("dashboardRerankNode"),
    dashboardRerankStatus: $("dashboardRerankStatus"),
    dashboardSuccessCount: $("dashboardSuccessCount"),
    defaultKnowledgeCard: $("defaultKnowledgeCard"),
    documentDetailContent: $("documentDetailContent"),
    documentResultCount: $("documentResultCount"),
    documentSearchInput: $("documentSearchInput"),
    documentStatusFilter: $("documentStatusFilter"),
    documentsList: $("documentsList"),
    emptyState: $("emptyState"),
    evaluationCaseSet: $("evaluationCaseSet"),
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
    coreStatusBadge: $("coreStatusBadge"),
    uploadStatusBadge: $("uploadStatusBadge"),
    rerankStatusBadge: $("rerankStatusBadge"),
    globalViewTitle: $("globalViewTitle"),
    headerEvidenceCount: $("headerEvidenceCount"),
    healthGrid: $("healthGrid"),
    healthOverviewText: $("healthOverviewText"),
    healthOverviewTitle: $("healthOverviewTitle"),
    knowledgeBaseGrid: $("knowledgeBaseGrid"),
    knowledgeEmptyState: $("knowledgeEmptyState"),
    knowledgeSearchInput: $("knowledgeSearchInput"),
    knowledgeStatusBadge: $("knowledgeStatusBadge"),
    knowledgeUpdatedAt: $("knowledgeUpdatedAt"),
    mobileMenuButton: $("mobileMenuButton"),
    overallHealth: $("overallHealth"),
    pipelineTaskCount: $("pipelineTaskCount"),
    pipelineTaskList: $("pipelineTaskList"),
    pipelineAutoRefreshNotice: $("pipelineAutoRefreshNotice"),
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
    retrievalModeHint: $("retrievalModeHint"),
    retrievalQueryInput: $("retrievalQueryInput"),
    retrievalRerankInput: $("retrievalRerankInput"),
    retrievalRerankStatus: $("retrievalRerankStatus"),
    retrievalResults: $("retrievalResults"),
    retrievalSettings: $("retrievalSettings"),
    retrievalTopKInput: $("retrievalTopKInput"),
    runRetrievalButton: $("runRetrievalButton"),
    runtimePort: $("runtimePort"),
    selectedFileName: $("selectedFileName"),
    selectedFileList: $("selectedFileList"),
    sidebarBackdrop: $("sidebarBackdrop"),
    sidebarHealthList: $("sidebarHealthList"),
    sidebarOverallDot: $("sidebarOverallDot"),
    sidebarOverallText: $("sidebarOverallText"),
    sidebarRefreshStatus: $("sidebarRefreshStatus"),
    sidebarUploadButton: $("sidebarUploadButton"),
    toastRegion: $("toastRegion"),
    uploadButton: $("uploadButton"),
    uploadDropCard: $("uploadDropCard"),
    uploadResult: $("uploadResult")
};

document.addEventListener("DOMContentLoaded", () => {
    document.title = PAGE_TITLE;
    bindNavigation();
    bindActions();
    setView("dashboard");
    resizeQuestionInput();
    renderSelectedFiles();

    Promise.allSettled([
        loadDocuments(),
        loadEvaluation(),
        loadSystemStatus()
    ]).then(() => {
        updatePipelineAutoRefreshNotice();
        updateDocumentPolling();
    });
});

function bindNavigation() {
    document.querySelectorAll(".nav-item[data-view], .rail-item[data-view], .rail-brand[data-view]").forEach((button) => {
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
        setView("pipeline");
        window.setTimeout(() => {
            fileSelectionOrigin = "pipeline";
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
        fileSelectionOrigin = "pipeline";
        elements.fileInput.value = "";
        elements.fileInput.click();
    });
    elements.fileInput.addEventListener("change", handleFileSelection);
    elements.uploadButton.addEventListener("click", uploadDocument);
    elements.clearUploadListButton.addEventListener("click", clearSelectedFiles);
    elements.knowledgeSearchInput.addEventListener("input", renderKnowledgeSearch);
    elements.defaultKnowledgeCard.addEventListener("click", () => setView("documents"));
    elements.defaultKnowledgeCard.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setView("documents");
        }
    });
    ["dragenter", "dragover"].forEach((eventName) => {
        elements.uploadDropCard.addEventListener(eventName, (event) => {
            event.preventDefault();
            elements.uploadDropCard.classList.add("drag-active");
        });
    });
    ["dragleave", "drop"].forEach((eventName) => {
        elements.uploadDropCard.addEventListener(eventName, (event) => {
            event.preventDefault();
            elements.uploadDropCard.classList.remove("drag-active");
        });
    });
    elements.uploadDropCard.addEventListener("drop", (event) => {
        const files = event.dataTransfer?.files;
        if (!files?.length) return;
        fileSelectionOrigin = "pipeline";
        handleSelectedFiles(Array.from(files));
    });

    elements.refreshDocumentsButton.addEventListener("click", () => loadDocuments());
    elements.documentSearchInput.addEventListener("input", renderDocuments);
    elements.documentStatusFilter.addEventListener("change", renderDocuments);
    elements.refreshPipelineButton.addEventListener("click", () => loadDocuments({ refreshPipeline: true }));
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
    document.addEventListener("visibilitychange", handleDocumentVisibilityChange);
}

function setView(viewName) {
    viewName = VIEW_META[viewName] ? viewName : "dashboard";
    currentViewName = viewName;
    const meta = VIEW_META[viewName];
    elements.retrievalSettings.open = false;

    document.querySelectorAll(".app-view").forEach((view) => {
        view.classList.toggle("active", view.dataset.viewName === viewName);
    });
    document.querySelectorAll(".nav-item[data-view], .rail-item[data-view], .rail-brand[data-view]").forEach((button) => {
        const active = button.dataset.view === viewName;
        button.classList.toggle("active", active);
        if (active) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    });

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
    updatePipelineAutoRefreshNotice();
    updateDocumentPolling();
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);

    if (!response.ok) {
        throw new Error(await readResponseError(response));
    }

    return response.json();
}

async function loadDocuments(options = {}) {
    const config = options && !("target" in options) ? options : {};
    const silent = Boolean(config.silent);
    const suppressError = Boolean(config.suppressError);
    const refreshPipeline = Boolean(config.refreshPipeline);

    if (!silent) {
        elements.refreshDocumentsButton.disabled = true;
        if (refreshPipeline) {
            elements.refreshPipelineButton.disabled = true;
        }
        elements.documentsList.replaceChildren(
            createEmptyPanel("正在加载文档列表...")
        );
    }

    try {
        const data = await fetchJson(`${API_BASE}/documents/`);
        latestDocuments = normalizeArray(data)
            .map(normalizeDocument)
            .sort((left, right) => dateValue(right.createdAt) - dateValue(left.createdAt));
        syncSelectedUploadItemsWithDocuments();
        renderSelectedFiles();
        renderDocuments();
        renderDashboardDocuments();
        updatePipelineAutoRefreshNotice();
        updateDocumentPolling();
        if (refreshPipeline && currentViewName === "pipeline") {
            loadRecentTaskLogs({ silent: true, suppressError: true });
        }
        return latestDocuments;
    } catch (error) {
        if (!silent) {
            latestDocuments = [];
            renderDocuments();
            renderDashboardDocuments();
            updatePipelineAutoRefreshNotice();
        }
        if (silent || suppressError) {
            console.warn("文档状态自动刷新失败", error);
        } else {
            showError(`文档列表加载失败：${getFriendlyError(error)}`);
        }
        return latestDocuments;
    } finally {
        if (!silent) {
            elements.refreshDocumentsButton.disabled = false;
            if (refreshPipeline) {
                elements.refreshPipelineButton.disabled = false;
            }
        }
    }
}

function hasPendingDocuments(documents = latestDocuments) {
    return documents.some((doc) => isDocumentProcessingStatus(doc.status));
}

function isDocumentProcessingStatus(status) {
    return ["PENDING", "PARSING"].includes(String(status || "").toUpperCase());
}

function isUploadProcessingStatus(status) {
    return ["PENDING", "PARSING", "UPLOADING"].includes(String(status || "").toUpperCase());
}

function shouldPollDocuments() {
    return DOCUMENT_POLLING_VIEWS.has(currentViewName)
        && (hasPendingDocuments() || hasTrackableUploadParsingItems())
        && !document.hidden;
}

function hasTrackableUploadParsingItems() {
    return selectedUploadItems.some((item) => (
        isMeaningful(item.documentId)
        && isDocumentProcessingStatus(item.status)
    ));
}

function startDocumentPolling() {
    if (documentPollingTimer || document.hidden) {
        return;
    }

    documentPollingTimer = window.setInterval(pollDocumentsOnce, DOCUMENT_POLLING_INTERVAL_MS);
}

function stopDocumentPolling() {
    if (!documentPollingTimer) {
        return;
    }

    window.clearInterval(documentPollingTimer);
    documentPollingTimer = null;
}

function updateDocumentPolling() {
    if (shouldPollDocuments()) {
        startDocumentPolling();
    } else {
        stopDocumentPolling();
    }
}

async function pollDocumentsOnce() {
    if (documentPollingInFlight || document.hidden) {
        return;
    }
    if (!DOCUMENT_POLLING_VIEWS.has(currentViewName)) {
        stopDocumentPolling();
        return;
    }

    documentPollingInFlight = true;
    try {
        await loadDocuments({
            silent: true,
            suppressError: true,
            refreshPipeline: currentViewName === "pipeline"
        });
        if (!hasPendingDocuments() && !hasTrackableUploadParsingItems()) {
            stopDocumentPolling();
        }
    } catch (error) {
        console.warn("文档状态轮询失败", error);
    } finally {
        documentPollingInFlight = false;
    }
}

function handleDocumentVisibilityChange() {
    if (document.hidden) {
        stopDocumentPolling();
        return;
    }

    updateDocumentPolling();
    if (DOCUMENT_POLLING_VIEWS.has(currentViewName) && (hasPendingDocuments() || hasTrackableUploadParsingItems())) {
        pollDocumentsOnce();
    }
}

function syncSelectedUploadItemsWithDocuments() {
    if (!selectedUploadItems.length) {
        return;
    }

    const documentsById = new Map(
        latestDocuments
            .filter((doc) => isMeaningful(doc.docId))
            .map((doc) => [String(doc.docId), doc])
    );

    selectedUploadItems = selectedUploadItems.map((item) => {
        if (!isMeaningful(item.documentId)) {
            return item;
        }

        const doc = documentsById.get(String(item.documentId));
        if (!doc) {
            return item;
        }

        return {
            ...item,
            status: doc.status,
            message: getDocumentProcessingMessage(doc)
        };
    });
}

function getDocumentProcessingMessage(doc) {
    if (doc.status === "SUCCESS") return "解析成功";
    if (doc.status === "FAILED") return formatUserMessage(doc.errorMessage || "解析失败");
    if (doc.status === "PARSING") return "后台正在解析";
    if (doc.status === "PENDING") return "等待后台解析";
    return "状态已更新";
}

function updatePipelineAutoRefreshNotice() {
    if (!elements.pipelineAutoRefreshNotice) {
        return;
    }

    const hasUploads = selectedUploadItems.length > 0;
    const hasDocuments = latestDocuments.length > 0;
    const hasProcessing = hasPendingDocuments()
        || selectedUploadItems.some((item) => isUploadProcessingStatus(item.status));
    const hasFailed = latestDocuments.some((doc) => doc.status === "FAILED")
        || selectedUploadItems.some((item) => String(item.status || "").toUpperCase() === "FAILED");

    elements.pipelineAutoRefreshNotice.className = "pipeline-refresh-notice";
    if (!hasUploads && !hasDocuments) {
        elements.pipelineAutoRefreshNotice.classList.add("hidden");
        elements.pipelineAutoRefreshNotice.textContent = "";
        return;
    }

    if (hasProcessing) {
        elements.pipelineAutoRefreshNotice.classList.add("info");
        elements.pipelineAutoRefreshNotice.textContent = "后台解析中，状态将自动刷新";
    } else if (hasFailed) {
        elements.pipelineAutoRefreshNotice.classList.add("warning");
        elements.pipelineAutoRefreshNotice.textContent = "部分文件解析失败，可查看失败原因后重试";
    } else {
        elements.pipelineAutoRefreshNotice.classList.add("success");
        elements.pipelineAutoRefreshNotice.textContent = "解析任务已完成";
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
            latestDocuments.length === 0
                ? createActionEmptyPanel(
                    "icon-file",
                    "知识库还没有文档",
                    "上传 PDF、TXT、Markdown 或 Word(.docx) 后，文档状态和 chunk 数量会显示在这里。",
                    "导入第一份文档",
                    "pipeline"
                )
                : createCenteredEmpty(
                    "icon-search",
                    "没有匹配的文档",
                    "请调整搜索关键词或解析状态筛选。"
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
        if (doc.status === "FAILED" && isMeaningful(doc.errorMessage)) {
            file.appendChild(
                createTextElement("div", "document-error", truncate(formatUserMessage(doc.errorMessage), 120))
            );
        }

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
    elements.knowledgeUpdatedAt.textContent = latestDocuments[0]?.createdAt
        ? `最近更新：${formatDate(latestDocuments[0].createdAt)}`
        : "尚未导入文档";
    const successCount = latestDocuments.filter((doc) => doc.status === "SUCCESS").length;
    const hasFailed = latestDocuments.some((doc) => doc.status === "FAILED");
    const hasProcessing = latestDocuments.some(
        (doc) => doc.status === "PENDING" || doc.status === "PARSING"
    );
    if (latestDocuments.length === 0) {
        elements.knowledgeStatusBadge.className = "status-badge neutral";
        elements.knowledgeStatusBadge.textContent = "待导入";
    } else if (hasFailed) {
        elements.knowledgeStatusBadge.className = "status-badge warning";
        elements.knowledgeStatusBadge.textContent = "部分文档失败";
    } else if (hasProcessing) {
        elements.knowledgeStatusBadge.className = "status-badge info";
        elements.knowledgeStatusBadge.textContent = "解析中";
    } else if (successCount > 0) {
        elements.knowledgeStatusBadge.className = "status-badge success";
        elements.knowledgeStatusBadge.textContent = "可检索";
    }
    elements.defaultKnowledgeCard.dataset.searchable = [
        "默认知识库",
        "企业知识库",
        "RAG",
        ...latestDocuments.map((doc) => doc.fileName)
    ].join(" ").toLowerCase();
    renderKnowledgeSearch();

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

function renderKnowledgeSearch() {
    const keyword = elements.knowledgeSearchInput.value.trim().toLowerCase();
    const cards = Array.from(
        elements.knowledgeBaseGrid.querySelectorAll("[data-searchable]")
    );
    let visibleCount = 0;

    cards.forEach((card) => {
        const searchable = String(card.dataset.searchable || "").toLowerCase();
        const visible = !keyword || searchable.includes(keyword);
        card.classList.toggle("hidden", !visible);
        if (visible) visibleCount += 1;
    });

    elements.knowledgeEmptyState.classList.toggle(
        "hidden",
        visibleCount > 0 || !keyword
    );
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
    const detailRows = [
        ["文件名", doc.fileName],
        ["文档 ID", doc.docId],
        ["文件类型", doc.type],
        ["文件大小", formatFileSize(doc.fileSize)],
        ["解析状态", getDocumentStatusText(doc.status)],
        ["分块数", isMeaningful(doc.chunkCount) ? doc.chunkCount : "暂无统计"],
        ["上传时间", formatDate(doc.createdAt)]
    ];
    if (doc.status === "FAILED" && isMeaningful(doc.errorMessage)) {
        detailRows.push(["失败原因", formatUserMessage(doc.errorMessage, "detail")]);
    }
    detailRows.forEach(([label, value]) => {
        const row = document.createElement("div");
        row.className = "detail-row";
        row.append(
            createTextElement("span", "", label),
            createTextElement("strong", "", String(value ?? "-"))
        );
        list.appendChild(row);
    });

    const guidance = document.createElement("div");
    guidance.className = "detail-guidance";
    guidance.append(
        createTextElement(
            "p",
            "",
            "当前展示文档元数据和解析状态。你可以在检索调试或 RAG 问答引用中查看命中的文档片段。"
        ),
        createButton("查看检索片段", "secondary-button detail-action", () => {
            setView("retrieval");
            window.setTimeout(() => elements.retrievalQueryInput.focus(), 0);
        })
    );

    elements.documentDetailContent.append(list, guidance);
}

function handleFileSelection() {
    handleSelectedFiles(Array.from(elements.fileInput.files || []));
}

function handleSelectedFiles(files) {
    if (!files.length) {
        return;
    }

    if (files.length > MAX_UPLOAD_FILES) {
        showError(`一次最多选择 ${MAX_UPLOAD_FILES} 个文件。`);
        return;
    }

    selectedUploadItems = files.map((file) => ({
        id: `upload-${++uploadItemSequence}`,
        file,
        status: "READY",
        documentId: null,
        taskId: null,
        message: "等待上传"
    }));
    renderSelectedFiles();
    elements.uploadResult.textContent = `已选择 ${selectedUploadItems.length} 个文件，准备上传。`;

    if (fileSelectionOrigin === "playground") {
        uploadDocument();
    }
}

function clearSelectedFiles() {
    if (uploadInProgress) {
        return;
    }

    selectedUploadItems = [];
    elements.fileInput.value = "";
    elements.uploadResult.textContent = "尚未选择文件。";
    renderSelectedFiles();
}

function renderSelectedFiles() {
    const hasFiles = selectedUploadItems.length > 0;
    const totalSize = selectedUploadItems.reduce((sum, item) => sum + Number(item.file?.size || 0), 0);
    elements.selectedFileName.textContent = hasFiles
        ? `${selectedUploadItems.length} 个文件待处理 · ${formatFileSize(totalSize)}`
        : UPLOAD_HELP_TEXT;

    elements.selectedFileList.innerHTML = "";
    if (!hasFiles) {
        updateUploadButtons();
        updatePipelineAutoRefreshNotice();
        updateDocumentPolling();
        return;
    }

    selectedUploadItems.forEach((item) => {
        const row = document.createElement("article");
        row.className = `upload-file-item ${getUploadItemStatusClass(item.status)}`;

        const main = document.createElement("div");
        main.className = "upload-file-main";
        main.append(
            createTextElement("strong", "", item.file.name),
            createTextElement(
                "span",
                "",
                `${getFileType(item.file.name)} · ${formatFileSize(item.file.size)}`
            )
        );

        const meta = document.createElement("div");
        meta.className = "upload-file-meta";
        meta.appendChild(
            createStatusBadge(getUploadItemStatusText(item.status), getUploadItemStatusClass(item.status))
        );

        row.append(main, meta);
        row.appendChild(
            createTextElement("p", "upload-file-message", getUploadItemDisplayMessage(item))
        );
        if (isMeaningful(item.documentId) || isMeaningful(item.taskId)) {
            row.appendChild(createUploadDebugDetails(item));
        }
        elements.selectedFileList.appendChild(row);
    });
    updateUploadButtons();
    updatePipelineAutoRefreshNotice();
    updateDocumentPolling();
}

async function uploadDocument() {
    if (!selectedUploadItems.length) {
        showError("请先选择 PDF、TXT、Markdown 或 Word(.docx) 文档。");
        return;
    }

    const formData = new FormData();
    selectedUploadItems.forEach((item) => {
        formData.append("files", item.file);
        item.status = "UPLOADING";
        item.message = "正在上传";
        item.documentId = null;
        item.taskId = null;
    });
    setUploadLoading(true);

    try {
        const data = await fetchJson(`${API_BASE}/documents/batch-upload`, {
            method: "POST",
            body: formData
        });
        const resultItems = normalizeArray(data?.items);
        selectedUploadItems = selectedUploadItems.map((item, index) => {
            const result = resultItems[index] || {};
            return {
                ...item,
                status: String(result.status || "UNKNOWN").toUpperCase(),
                documentId: firstMeaningful(result.document_id, result.doc_id),
                taskId: result.task_id || null,
                message: formatUserMessage(firstMeaningful(result.message, result.msg, "已提交解析"))
            };
        });
        renderSelectedFiles();
        renderBatchUploadResult(data);
        elements.composerHint.textContent = `上传完成：接收 ${data.accepted || 0} 个，失败 ${data.failed || 0} 个`;
        showNotice(`批量上传完成：接收 ${data.accepted || 0} 个，失败 ${data.failed || 0} 个。`);
        elements.fileInput.value = "";
        await loadDocuments({ refreshPipeline: currentViewName === "pipeline" });
    } catch (error) {
        const message = formatUserMessage(getFriendlyError(error));
        selectedUploadItems = selectedUploadItems.map((item) => ({
            ...item,
            status: "FAILED",
            message
        }));
        renderSelectedFiles();
        elements.uploadResult.textContent = `上传失败：${message}`;
        elements.composerHint.textContent = "文档上传失败";
        showError(`文档上传失败：${message}`);
    } finally {
        setUploadLoading(false);
    }
}

function renderBatchUploadResult(data) {
    renderKeyValues(elements.uploadResult, [
        ["总数", firstMeaningful(data?.total, selectedUploadItems.length)],
        ["已接收", firstMeaningful(data?.accepted, 0)],
        ["失败", firstMeaningful(data?.failed, 0)],
        ["说明", "每个文件的处理结果已显示在列表中"]
    ]);
}

function createUploadDebugDetails(item) {
    const details = document.createElement("details");
    details.className = "upload-debug-details";
    const summary = document.createElement("summary");
    summary.textContent = "查看详情";

    const debug = document.createElement("div");
    debug.className = "upload-debug-grid";
    if (isMeaningful(item.documentId)) {
        debug.append(
            createTextElement("span", "", "document_id"),
            createTextElement("code", "", String(item.documentId))
        );
    }
    if (isMeaningful(item.taskId)) {
        debug.append(
            createTextElement("span", "", "task_id"),
            createTextElement("code", "", String(item.taskId))
        );
    }

    details.append(summary, debug);
    return details;
}

function getUploadItemDisplayMessage(item) {
    const status = String(item.status || "").toUpperCase();
    if (status === "PENDING") return "等待后台解析";
    if (status === "SUCCESS") return "解析成功";
    if (status === "FAILED") return formatUserMessage(item.message || "解析失败");
    if (status === "PARSING") return "后台正在解析";
    if (status === "UPLOADING") return "正在上传";
    return formatUserMessage(item.message || "等待上传");
}

function setUploadLoading(isLoading) {
    uploadInProgress = isLoading;
    selectedUploadItems = selectedUploadItems.map((item) => ({
        ...item,
        status: isLoading && item.status === "READY" ? "UPLOADING" : item.status,
        message: isLoading && item.status === "READY" ? "正在上传" : item.message
    }));
    elements.uploadButton.textContent = isLoading ? "上传中..." : "上传并解析";

    if (isLoading) {
        const count = selectedUploadItems.length;
        elements.uploadResult.textContent = `正在上传 ${count} 个文件...`;
        elements.composerHint.textContent = `正在上传 ${count} 个文件...`;
    }
    renderSelectedFiles();
}

function updateUploadButtons() {
    const hasFiles = selectedUploadItems.length > 0;
    elements.uploadButton.disabled = uploadInProgress || !hasFiles;
    elements.clearUploadListButton.disabled = uploadInProgress || !hasFiles;
    elements.chooseFileButton.disabled = uploadInProgress;
    elements.attachmentButton.disabled = uploadInProgress;
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
        await loadDocuments({ refreshPipeline: currentViewName === "pipeline" });
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

async function loadRecentTaskLogs(options = {}) {
    const config = options && !("target" in options) ? options : {};
    const silent = Boolean(config.silent);
    const suppressError = Boolean(config.suppressError);

    if (!silent) {
        elements.refreshPipelineButton.disabled = true;
        elements.pipelineTaskList.replaceChildren(
            createEmptyPanel("正在读取最近解析任务...")
        );
    }

    try {
        if (latestDocuments.length === 0) {
            await loadDocuments({ silent, suppressError: true });
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
        if (!silent) {
            renderPipelineLogs([]);
        }
        if (silent || suppressError) {
            console.warn("解析任务自动刷新失败", error);
        } else {
            showError(`解析任务读取失败：${getFriendlyError(error)}`);
        }
    } finally {
        if (!silent) {
            elements.refreshPipelineButton.disabled = false;
        }
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
                formatUserMessage(log.error_message || log.message || "暂无补充信息")
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
            sources: response.sources,
            rawCitationCount: response.rawCitationCount
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
            sources: [],
            rawCitationCount: 0
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
    const avatar = createTextElement("span", "assistant-avatar", "");
    avatar.appendChild(createSvgIcon("icon-chat"));
    identity.append(
        avatar,
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
        sources: [],
        rawCitationCount: 0
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
    renderEvidence(evidence.sources, evidence.answerType, evidence.rawCitationCount);
}

function normalizeAnswerResponse(data) {
    const answer = String(data?.answer ?? data?.result ?? "后端没有返回可展示的回答。");
    const sourceCollections = [data?.citations, data?.sources, data?.chunks]
        .filter(Array.isArray);
    const rawSources = sourceCollections.find((items) => items.length > 0)
        || sourceCollections[0]
        || [];
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
    return {
        answer,
        answerType,
        usedRetrieval,
        sources,
        rawCitationCount: answerType === "grounded" ? rawSources.length : 0
    };
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

function renderEvidence(sources, answerType, rawCitationCount = 0) {
    const items = normalizeArray(sources).map(normalizeSource).filter(isUsefulSource);
    const state = getAnswerState(answerType);
    const missingPreviewCount = items.filter((source) => !isMeaningful(source.chunkText)).length;

    elements.evidenceStatus.className = `answer-state ${state.className}`;
    elements.evidenceStatus.textContent = state.label;
    elements.evidenceCount.textContent = `${items.length} 条`;
    elements.headerEvidenceCount.textContent = String(items.length);
    elements.evidenceContent.innerHTML = "";

    if (items.length === 0) {
        const copy = rawCitationCount > 0
            ? ["引用内容暂不可预览", "已返回引用，但片段预览字段缺失。"]
            : ({
            loading: ["正在生成回答", "回答完成后将同步显示当前回答的引用证据。"],
            chitchat: ["未使用知识库检索", "当前回答未使用知识库检索。"],
            unanswerable: ["未展示来源", "未找到足够知识库依据，因此未展示来源。"],
            error: ["证据获取失败", "本次请求未完成，没有生成可核对的引用。"],
            neutral: ["尚无引用证据", "当前回答没有使用知识库引用。"]
        }[answerType] || ["当前回答没有引用", "当前回答没有使用知识库引用。"]);
        elements.evidenceContent.appendChild(
            createCenteredEmpty("icon-panel", copy[0], copy[1])
        );
        return;
    }

    if (missingPreviewCount > 0) {
        const notice = createTextElement(
            "div",
            "evidence-preview-notice",
            missingPreviewCount === items.length
                ? "已返回引用，但片段预览字段缺失。"
                : `${missingPreviewCount} 条引用未返回片段预览，其余引用可正常查看。`
        );
        notice.setAttribute("role", "status");
        elements.evidenceContent.appendChild(notice);
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
    appendMetaIfPresent(meta, "source_type", source.sourceType);
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
            truncate(source.chunkText, 1600) || "已返回引用，但片段预览字段缺失。"
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
        ["分数", source.score],
        ["混合分", source.hybridScore],
        ["向量", source.vectorScore],
        ["关键词", source.keywordScore],
        ["重排", source.rerankScore]
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
        createEmptyPanel("正在执行向量化与混合检索...")
    );
    elements.retrievalLatency.textContent = "运行中";
    elements.retrievalRerankStatus.textContent = useRerank ? "尝试重排" : "使用基础检索";
    elements.retrievalModeHint.textContent = useRerank
        ? "已请求二次重排，完成后将展示基础排序与重排排序对比。"
        : "当前使用基础检索，未启用二次重排。";

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
        elements.retrievalModeHint.textContent = "检索状态暂不可用，请检查核心检索服务后重试。";
        showError(`检索测试失败：${getFriendlyError(error)}`);
    } finally {
        elements.runRetrievalButton.disabled = false;
        elements.runRetrievalButton.classList.remove("is-loading");
    }
}

function renderRetrievalResults(data) {
    const baselineResults = normalizeArray(data?.baseline_results);
    const rerankResults = normalizeArray(data?.rerank_results);
    const results = data?.rerank_requested
        ? (rerankResults.length ? rerankResults : baselineResults)
        : (baselineResults.length ? baselineResults : normalizeArray(data?.results));
    const rerankStatus = String(data?.rerank_status || "disabled").toLowerCase();
    const rerankModel = data?.rerank_model || "qwen3-rerank";
    const rerankLabel = rerankStatus === "enabled"
        ? `DashScope ${rerankModel} · 已启用`
        : getRerankStatusText(rerankStatus);
    elements.retrievalLatency.textContent = `${formatNumber(data?.latency_ms, 2)} ms`;
    if (isMeaningful(data?.rerank_latency_ms)) {
        elements.retrievalLatency.title = `重排耗时 ${formatNumber(data.rerank_latency_ms, 2)} ms`;
    } else {
        elements.retrievalLatency.removeAttribute("title");
    }
    elements.retrievalRerankStatus.textContent = rerankLabel;
    elements.retrievalRerankStatus.title = [
        data?.rerank_message,
        data?.rerank_error
    ].filter(isMeaningful).join(" ");
    elements.retrievalModeHint.textContent = rerankStatus === "enabled"
        ? "已启用二次重排，可对照基础排序与重排排序。"
        : rerankStatus === "fallback"
            ? "二次重排调用失败，当前展示基础检索结果。"
            : "当前使用基础检索，未启用二次重排。";
    elements.retrievalResults.innerHTML = "";
    setDashboardRerankState(rerankStatus, rerankModel);

    if (rerankStatus === "fallback") {
        const notice = createTextElement(
            "div",
            "retrieval-status-note warning",
            "重排调用失败，已回退到原始检索排序。"
        );
        notice.setAttribute("role", "status");
        elements.retrievalResults.appendChild(notice);
    }

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
        const rankGroup = document.createElement("span");
        rankGroup.className = "retrieval-rank-group";
        rankGroup.appendChild(
            createTextElement(
                "span",
                "retrieval-rank",
                `基础排序 ${item.baseline_rank || item.rank || index + 1}`
            )
        );
        if (isMeaningful(item.rerank_rank)) {
            rankGroup.appendChild(
                createTextElement(
                    "span",
                    "retrieval-rank rerank",
                    `重排排序 ${item.rerank_rank}`
                )
            );
        }
        title.append(rankGroup, createTextElement("strong", "", resultSource.fileName));
        summary.append(
            title,
            createTextElement(
                "span",
                "source-score",
                isMeaningful(item.score) ? formatScore(item.score) : "分数 -"
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
        appendScoreIfPresent(scores, "分数", item.score);
        appendScoreIfPresent(scores, "混合分", item.hybrid_score);
        appendScoreIfPresent(scores, "向量", item.vector_score);
        appendScoreIfPresent(scores, "关键词", item.keyword_score);
        appendScoreIfPresent(scores, "重排", item.rerank_score);

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
    const caseSetName = getEvaluationCaseSetName(data);
    elements.evaluationCaseSet.textContent = data?.available
        ? `评测集：${caseSetName}`
        : "评测集：暂无评测报告";
    if (isMeaningful(data?.case_file)) {
        elements.evaluationCaseSet.title = data.case_file;
    } else {
        elements.evaluationCaseSet.removeAttribute("title");
    }
    renderEvaluationFailures(normalizeArray(data?.failures));
    renderDashboardEvaluation(data);
}

function renderDashboardEvaluation(data) {
    const retrieval = data?.retrieval || {};
    const answer = data?.answer || {};
    const baseline = retrieval?.baseline || {};
    const values = [
        ["命中率", formatPercent(baseline.hit_rate_at_k)],
        ["召回率", formatPercent(baseline.recall_at_k)],
        ["精确率", formatPercent(baseline.precision_at_k)],
        ["MRR", formatPercent(baseline.mrr)],
        ["断言命中", formatPercent(answer.expected_claim_hit_rate)],
        [
            "弱依据",
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

    elements.dashboardEvalRate.textContent = data?.available
        ? "结果仅供参考"
        : "暂无评测数据";
    elements.dashboardEvalSource.textContent = data?.available
        ? `评测集：${getEvaluationCaseSetName(data)}`
        : "暂无评测数据";
    elements.dashboardEvalFallback.classList.toggle("hidden", Boolean(data?.available));
}

function getEvaluationCaseSetName(data) {
    return firstMeaningful(
        data?.case_set_name,
        data?.retrieval?.case_set_name,
        data?.answer?.case_set_name,
        "默认 RAG Builder 项目评测集"
    );
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

    const serviceStatus = deriveServiceStatus(components);
    return {
        status: serviceStatus.core === "ok" && serviceStatus.upload === "ok"
            ? "ok"
            : serviceStatus.core === "ok"
            ? "degraded"
            : "error",
        service_status: serviceStatus,
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
        elements.healthOverviewTitle.textContent = "正在检查运行状态";
        elements.healthOverviewText.textContent = "核心检索、上传解析和可选检索增强将分别判断。";
        setRuntimeBadge(elements.coreStatusBadge, "核心检索：检查中", "neutral", "unknown");
        setRuntimeBadge(elements.uploadStatusBadge, "上传解析：检查中", "neutral", "unknown");
        setRuntimeBadge(elements.rerankStatusBadge, "检索模式：读取中", "neutral", "disabled");
        elements.sidebarOverallDot.className = "status-dot unknown";
        elements.sidebarOverallText.textContent = "系统检查中";
    }
}

function renderSystemStatus(data) {
    const components = data?.components || {};
    const serviceStatus = {
        ...deriveServiceStatus(components),
        ...(data?.service_status || {})
    };
    elements.healthGrid.innerHTML = "";

    HEALTH_GROUPS.forEach((group) => {
        const section = document.createElement("section");
        section.className = "health-group";
        const heading = document.createElement("div");
        heading.className = "health-group-heading";
        heading.append(
            createTextElement("h3", "", group.title),
            createTextElement("p", "", group.description)
        );

        const grid = document.createElement("div");
        grid.className = "health-group-grid";
        group.keys.forEach((key) => {
            const component = findComponent(components, key);
            const card = document.createElement("article");
            card.className = `health-card ${getHealthStatusClass(component.status)}`;
            card.append(
                createTextElement("h4", "", component.name || getComponentName(key)),
                createStatusBadge(
                    getComponentStatusText(key, component.status),
                    getHealthStatusClass(component.status)
                ),
                createTextElement("p", "", component.message || "当前没有可用状态")
            );
            if (isMeaningful(component.model)) {
                card.appendChild(
                    createTextElement("div", "health-model", `model: ${component.model}`)
                );
            }
            grid.appendChild(card);
        });

        section.append(heading, grid);
        elements.healthGrid.appendChild(section);
    });

    renderServiceSummary(serviceStatus);
    elements.runtimePort.textContent = window.location.port || data?.api_port || "18000";

    renderSidebarHealth(components, data?.api_port);
    renderRetrievalConfiguration(data?.retrieval || {});
}

function deriveServiceStatus(components) {
    const coreKeys = ["fastapi", "elasticsearch", "redis", "postgresql"];
    const coreOk = coreKeys.every((key) => {
        const status = String(findComponent(components, key).status || "").toLowerCase();
        return ["ok", "success", "configured"].includes(status);
    });
    const minioStatus = String(findComponent(components, "minio").status || "").toLowerCase();
    const celeryStatus = String(findComponent(components, "celery").status || "").toLowerCase();
    const rerankStatus = String(findComponent(components, "rerank").status || "optional").toLowerCase();
    let upload = "ok";

    if (["error", "failed", "fail"].includes(minioStatus)) {
        upload = "error";
    } else if (["error", "failed", "fail"].includes(celeryStatus)) {
        upload = "error";
    } else if (
        ["unknown", "checking", ""].includes(minioStatus)
        || ["unknown", "checking", ""].includes(celeryStatus)
    ) {
        upload = "unknown";
    }

    return {
        core: coreOk ? "ok" : "error",
        upload,
        rerank: rerankStatus
    };
}

function renderServiceSummary(serviceStatus) {
    const coreOk = serviceStatus.core === "ok";
    const uploadStatus = String(serviceStatus.upload || "unknown").toLowerCase();
    const rerankStatus = String(serviceStatus.rerank || "optional").toLowerCase();

    setRuntimeBadge(
        elements.coreStatusBadge,
        coreOk ? "核心检索：正常" : "核心检索：异常",
        coreOk ? "success" : "danger"
    );

    if (uploadStatus === "ok") {
        setRuntimeBadge(elements.uploadStatusBadge, "上传解析：正常", "success");
    } else if (uploadStatus === "unknown") {
        setRuntimeBadge(elements.uploadStatusBadge, "上传解析：未检测", "warning");
    } else {
        setRuntimeBadge(elements.uploadStatusBadge, "上传解析：异常", "danger");
    }

    if (["optional", "disabled"].includes(rerankStatus)) {
        setRuntimeBadge(elements.rerankStatusBadge, "检索模式：基础检索", "neutral", "disabled");
    } else if (["ok", "success", "configured", "enabled"].includes(rerankStatus)) {
        setRuntimeBadge(elements.rerankStatusBadge, "检索模式：重排检索", "success");
    } else if (["fallback", "warning", "degraded"].includes(rerankStatus)) {
        setRuntimeBadge(elements.rerankStatusBadge, "检索模式：基础检索", "warning");
    } else {
        setRuntimeBadge(elements.rerankStatusBadge, "检索模式：配置异常", "danger");
    }

    if (!coreOk) {
        elements.overallHealth.className = "status-badge danger";
        elements.overallHealth.textContent = "核心服务异常";
        elements.healthOverviewTitle.textContent = "核心检索服务异常";
        elements.healthOverviewText.textContent = "请优先检查 FastAPI、Elasticsearch、PostgreSQL 与 Redis。";
        elements.sidebarOverallDot.className = "status-dot error";
        elements.sidebarOverallText.textContent = "核心检索异常";
    } else if (uploadStatus === "error") {
        elements.overallHealth.className = "status-badge warning";
        elements.overallHealth.textContent = "上传解析服务异常";
        elements.healthOverviewTitle.textContent = "核心服务正常";
        elements.healthOverviewText.textContent = "已有知识库问答可用；新文档上传或解析当前可能受影响。";
        elements.sidebarOverallDot.className = "status-dot warning";
        elements.sidebarOverallText.textContent = "上传解析异常";
    } else if (uploadStatus === "unknown") {
        elements.overallHealth.className = "status-badge warning";
        elements.overallHealth.textContent = "解析 Worker 未检测";
        elements.healthOverviewTitle.textContent = "核心服务正常";
        elements.healthOverviewText.textContent = "已有知识库问答可用；解析 Worker 当前未检测。";
        elements.sidebarOverallDot.className = "status-dot warning";
        elements.sidebarOverallText.textContent = "解析 Worker 未检测";
    } else {
        elements.overallHealth.className = "status-badge success";
        elements.overallHealth.textContent = "核心服务正常";
        elements.healthOverviewTitle.textContent = "核心服务正常";
        elements.healthOverviewText.textContent = "检索问答与上传解析服务当前可用。";
        elements.sidebarOverallDot.className = "status-dot ok";
        elements.sidebarOverallText.textContent = "核心服务正常";
    }
}

function setRuntimeBadge(element, label, statusClass, dotClass = getHealthDotClass(statusClass)) {
    if (!element) {
        return;
    }
    element.className = `runtime-badge ${statusClass}`;
    element.replaceChildren(
        createTextElement("span", `status-dot ${dotClass}`, ""),
        createTextElement("span", "", label)
    );
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
            createTextElement("b", "", getComponentStatusText(key, component.status))
        );
        elements.sidebarHealthList.appendChild(item);
    });
}

function getFastApiRuntimeLabel(apiPort) {
    const currentPort = window.location.port;
    if (currentPort) {
        return `FastAPI 端口 ${currentPort}`;
    }
    if (isMeaningful(apiPort)) {
        return `FastAPI 端口 ${apiPort}`;
    }
    return "FastAPI 当前连接";
}

function renderRetrievalConfiguration(config) {
    elements.playgroundMode.textContent = formatRetrievalMode(config.mode);
    elements.playgroundTopK.textContent = isMeaningful(config.top_k)
        ? String(config.top_k)
        : "5";
    const rerankModel = config.rerank_model || "qwen3-rerank";
    elements.playgroundRerank.textContent = config.rerank_apply_to_ask
        ? `DashScope ${rerankModel}`
        : config.rerank_enabled
        ? `${rerankModel}（调试页可用）`
        : "基础检索";
    const runtimeStatus = String(config.rerank_runtime_status || "").toLowerCase();
    setDashboardRerankState(
        ["enabled", "fallback"].includes(runtimeStatus)
            ? runtimeStatus
            : config.rerank_enabled
            ? "enabled"
            : "disabled",
        rerankModel
    );
    elements.playgroundThreshold.textContent = isMeaningful(config.citation_threshold)
        ? Number(config.citation_threshold).toFixed(2)
        : "0.60";
}

function formatRetrievalMode(mode) {
    const value = String(mode || "").trim().toLowerCase();
    if (!value || value === "hybrid") return "混合检索";
    if (value === "vector") return "向量检索";
    if (value === "keyword") return "关键词检索";
    return String(mode);
}

function setDashboardRerankState(status, model) {
    const value = String(status || "disabled").toLowerCase();
    elements.dashboardRerankNode.classList.remove("configured", "disabled", "fallback");
    if (value === "enabled") {
        elements.dashboardRerankNode.classList.add("configured");
        elements.dashboardRerankStatus.textContent = `DashScope ${model}`;
    } else if (value === "fallback") {
        elements.dashboardRerankNode.classList.add("fallback");
        elements.dashboardRerankStatus.textContent = "调用失败，已回退";
    } else {
        elements.dashboardRerankNode.classList.add("disabled");
        elements.dashboardRerankStatus.textContent = "可选功能 · 未开启";
    }
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
        fileSize: firstMeaningful(doc?.file_size, doc?.fileSize, doc?.size),
        errorMessage: formatUserMessage(firstMeaningful(doc?.error_message, doc?.errorMessage))
    };
}

function normalizeSource(source) {
    const item = source && typeof source === "object" ? source : {};
    const metadata = item.metadata && typeof item.metadata === "object"
        ? item.metadata
        : {};
    const docId = firstMeaningful(
        item.docId,
        item.doc_id,
        item.document_id,
        item.source_id,
        item.id,
        metadata.doc_id,
        metadata.document_id
    );
    const chunkId = firstMeaningful(
        item.chunkId,
        item.chunk_id,
        metadata.chunk_id
    );
    const explicitName = normalizeSourceName(firstMeaningful(
        item.fileName,
        item.document_name,
        item.filename,
        item.file_name,
        item.title,
        item.doc_name,
        item.source_name,
        metadata.filename,
        metadata.document_name,
        metadata.file_name,
        metadata.title
    ));
    return {
        docId,
        fileName: explicitName || buildSourceFallback(docId, chunkId),
        chunkId,
        pageNumber: firstMeaningful(
            item.pageNumber,
            item.page_number,
            item.page,
            metadata.page_number,
            metadata.page
        ),
        chunkText: String(firstMeaningful(
            item.chunkText,
            item.text_preview,
            item.snippet,
            item.chunk_text,
            item.content,
            item.text,
            metadata.text_preview,
            metadata.snippet,
            metadata.text,
            metadata.chunk_text,
            metadata.content,
            item.preview,
            metadata.preview
        ) ?? ""),
        sourceType: firstMeaningful(
            item.sourceType,
            item.source_type,
            metadata.source_type,
            metadata.sourceType
        ),
        score: firstMeaningful(item.score, item._score, item.similarity, metadata.score),
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
        source.chunkText,
        source.sourceType,
        source.score
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

function createActionEmptyPanel(iconId, title, text, buttonText, viewName) {
    const empty = createCenteredEmpty(iconId, title, text);
    const action = createButton(
        buttonText,
        "accent-button",
        () => setView(viewName)
    );
    empty.appendChild(action);
    return empty;
}

function createEmptyPanel(text) {
    const loading = String(text).startsWith("正在");
    return createTextElement(
        "div",
        loading ? "empty-panel loading-state" : "empty-panel",
        text
    );
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
        celery: "解析 Worker",
        embedding: "Embedding 模型",
        llm: "LLM",
        rerank: "重排模型"
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
    if (value === "PENDING") return "等待后台解析";
    return "状态未知";
}

function getUploadItemStatusClass(status) {
    const value = String(status || "").toUpperCase();
    if (value === "FAILED") return "danger";
    if (value === "SUCCESS") return "success";
    if (["PENDING", "PARSING", "UPLOADING"].includes(value)) return "info";
    if (value === "READY") return "neutral";
    return getDocumentStatusClass(value);
}

function getUploadItemStatusText(status) {
    const value = String(status || "").toUpperCase();
    if (value === "READY") return "待上传";
    if (value === "UPLOADING") return "上传中";
    if (value === "PENDING") return "已提交解析";
    if (value === "SUCCESS") return "解析成功";
    if (value === "FAILED") return "解析失败";
    if (value === "PARSING") return "解析中";
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
    if (["disabled", "optional"].includes(value)) return "neutral";
    return "neutral";
}

function getHealthDotClass(status) {
    const value = String(status || "").toLowerCase();
    if (["ok", "success", "configured"].includes(value)) return "ok";
    if (["error", "failed", "fail"].includes(value)) return "error";
    if (["degraded", "warning"].includes(value)) return "warning";
    if (["disabled", "optional"].includes(value)) return "disabled";
    return "unknown";
}

function getDependencyStatusText(status) {
    const value = String(status || "").toLowerCase();
    if (["ok", "success"].includes(value)) return "正常";
    if (value === "configured") return "已配置";
    if (value === "disabled") return "未开启";
    if (value === "optional") return "可选功能";
    if (["error", "failed", "fail"].includes(value)) return "异常";
    if (["degraded", "warning"].includes(value)) return "部分依赖异常";
    if (value === "checking") return "检查中";
    return "未知";
}

function getComponentStatusText(key, status) {
    const value = String(status || "").toLowerCase();
    if (key === "rerank" && ["optional", "disabled"].includes(value)) {
        return "可选功能";
    }
    if (key === "celery" && ["unknown", "checking", ""].includes(value)) {
        return "未检测";
    }
    if (key === "minio" && ["error", "failed", "fail"].includes(value)) {
        return "连接失败";
    }
    return getDependencyStatusText(value);
}

function getOverallHealthText(status) {
    const value = String(status || "").toLowerCase();
    if (value === "ok") return "正常";
    if (value === "degraded") return "部分依赖异常";
    if (value === "error") return "系统异常";
    return "未知";
}

function getRerankStatusText(status) {
    const value = String(status || "").toLowerCase();
    if (value === "enabled") return "已启用";
    if (["disabled", "optional"].includes(value)) return "基础检索";
    if (value === "fallback") return "调用失败，已回退";
    if (value === "unavailable") return "不可用";
    if (value === "failed") return "执行失败";
    return isMeaningful(status) ? String(status) : "-";
}

function getFileType(fileName) {
    const parts = String(fileName || "").split(".");
    const suffix = parts.length > 1 ? `.${parts.pop().toLowerCase()}` : "";
    return {
        ".pdf": "PDF",
        ".txt": "TXT",
        ".md": "Markdown",
        ".docx": "Word 文档",
        ".doc": "Word 旧格式"
    }[suffix] || (suffix ? suffix.slice(1).toUpperCase() : "-");
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

function formatUserMessage(message, mode = "default") {
    if (!isMeaningful(message)) {
        return "";
    }

    const text = String(message);
    const normalized = text.toLowerCase();
    const isDocxMissing = normalized.includes("no module named 'docx'")
        || normalized.includes('no module named "docx"')
        || normalized.includes("缺少 word 解析依赖")
        || normalized.includes("当前环境缺少 word 解析依赖")
        || normalized.includes("word 解析组件未安装");

    if (isDocxMissing) {
        return mode === "detail"
            ? "Word 解析组件未安装，请安装 python-docx 后重试。"
            : "Word 文档解析失败：当前环境缺少 Word 解析依赖，请安装 python-docx 后重试。";
    }

    if (normalized.includes("file is not a zip file")) {
        return "Word 文档格式无效：该文件不是标准 .docx，请用 Word/WPS 另存为 .docx 后重新上传。";
    }

    if (normalized.includes("no relationship of type")) {
        return "Word 文档结构异常：文件可能已损坏或不是标准 .docx，请重新下载或另存为 .docx 后上传。";
    }

    if (normalized.includes("batch size is invalid")
        || normalized.includes("internalerror.algo.invalidparameter")) {
        return "Embedding 批量处理失败：单次向量化文本块数量超过模型限制，请启用分批处理后重试。";
    }

    if (normalized.includes("openaierror")) {
        return "模型调用失败：Embedding 服务返回异常，请稍后重试或检查模型配置。";
    }

    if (normalized.includes("no module named")) {
        return "文档解析失败：当前环境缺少必要依赖，请补充依赖后重试。";
    }

    if (normalized.includes("modulenotfounderror")
        || normalized.includes("importerror")
        || normalized.includes("filenotfounderror")
        || normalized.includes("valueerror")
        || normalized.includes("typeerror")
        || normalized.includes("traceback")) {
        return "文档处理失败，请检查文件格式或后台依赖后重试。";
    }

    return text;
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
