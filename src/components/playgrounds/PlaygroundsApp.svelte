<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import CodeEditor from "./CodeEditor.svelte";
  import FileExplorer from "./FileExplorer.svelte";
  import PgIcon, { type PgIconName } from "./PgIcon.svelte";
  import PlaygroundsPythonRepl from "./PlaygroundsPythonRepl.svelte";
  import PlaygroundsJsRepl from "./PlaygroundsJsRepl.svelte";
  import PlaygroundsShell from "./PlaygroundsShell.svelte";
  import AvatarsPanel from "./roster/AvatarsPanel.svelte";
  import {
    inviteRosterAvatarToSession,
    registerRosterInviteAcceptedHandler,
    registerRosterRemoteActHandler,
    registerRosterHomeSeatReadyHandler,
    setRosterOpenSession,
    getRosterProjectionSandboxId,
    sendSessionSeatBound,
    sendRosterRelayPayload,
    SESSION_EVENT_KIND,
    SESSION_SEAT_BOUND_KIND,
    buildSessionActResultPayload,
    hasRosterInviteInLocation,
    type SessionActPayload,
  } from "./roster";
  import { consumePgProvisionFromLocation } from "./platform/consumePgProvision";
  import { consumePgInviteFromLocation } from "./platform/consumePgInvite";
  import { hasPgInviteInLocation, buildPgInviteDeepLink, parsePgInviteFromLocation } from "./platform/platformInviteUrl";
  import {
    INVITE_STORAGE_RESTRICTED_TITLE,
    isInviteStorageRestrictedError,
  } from "./storageErrors";
  import {
    isConsumerPlayLanding,
    isPlatformInviteLanding,
  } from "./platform/platformConsumerLanding";
  import {
    clearPlatformFieldApiKey,
    hasPlatformFieldApiKey,
    installPlatformFieldCredentialLifecycle,
    subscribePlatformFieldCredential,
  } from "./platform/platformFieldCredential";
  import { platformFieldLoginUrl } from "./platform/platformClient";
  import { registerPlatformComposeShell } from "./platform/platformComposeShell";
  import { getPlatformInviteShell } from "./platform/platformInviteShell";
  import {
    registerPlatformInviteShareShell,
    type PlatformInviteSharePayload,
  } from "./platform/platformInviteShareShell";
  import {
    presentPlatformInviteJoinPending,
    registerPlatformInviteJoinShell,
    type PlatformInviteJoinPayload,
  } from "./platform/platformInviteJoinShell";
  import { guestJoinPlatformTicket } from "./platform/platformGuestJoinBridge";
  import { composeSessionProtocol } from "./platform/platformCompose";
  import PlatformInviteShareDialog from "./platform/PlatformInviteShareDialog.svelte";
  import PlatformInviteJoinDialog from "./platform/PlatformInviteJoinDialog.svelte";
  import {
    assertCanvasEntryServed,
    buildCanvasEntryUrl,
    ensureCanvasServiceWorker,
    invalidateFunctionsModuleCache,
    registerCanvasApiHandler,
    syncCanvasSnapshot,
  } from "./canvasSw";
  import { measureWorkCanvasViewport } from "./canvasViewport";
  import { clearMockKvStore } from "./mockKv";
  import { clearMockDbStore } from "./mockDb";
  import { resetPlaygroundsToFirstVisit } from "./playgroundsFactoryReset";
  import {
    clearLegacyProjectSecretsRoot,
    deleteSecret,
    destroySecretStore,
    getSecretStoreStatus,
    initializeSecretStore,
    listSecretMetas,
    lockSecretStore,
    registerWebAuthnUnlock,
    setSecret,
    unlockSecretStore,
    unlockSecretStoreWithWebAuthn,
    unregisterWebAuthnUnlock,
    type SecretMeta,
    type SecretStoreStatus,
  } from "./secretStore";
  import { probeWebAuthnPrfAvailability } from "./secretStoreWebAuthn";
  import { clearCheckpointsForProject } from "./hostCheckpoint";
  import { extractHtmlTitle } from "./composePreview";
  import {
    fetchGithubProject,
    formatGithubSource,
    parseGithubUrl,
  } from "./githubProject";
  import { fetchGitlabProject } from "./gitlabProject";
  import {
    readActiveAgentSandboxId,
    writeActiveAgentSandboxId,
  } from "./activeAgent";
  import {
    readActiveWorkSandboxId,
    writeActiveWorkSandboxId,
  } from "./activeWorkProject";
  import {
    AGENT_BASE_STARTER_NAME,
    createAgentBaseStarterFiles,
  } from "./agentBaseStarter";
  import {
    agentFilesHaveController,
    commandAgentController,
    ensureAgentController,
    fileMapNeedsAgentController,
    getAgentControllerSandboxId,
    getDesiredAgentFiles,
    stopAgentController,
    stopAgentRuntime,
    stopSessionSeatAgent,
    subscribeAgentRuntimeRole,
    syncAgentController,
    syncSessionSeatAgent,
  } from "./agentControllerHost";
  import { installFleetStressHooks } from "./fleetStress";
  import {
    getAgentRuntimeHub,
    type AgentRuntimeHubStatus,
  } from "./agentRuntimeHub";
  import { setSessionMailboxFanout } from "./sessionMailboxFanout";
  import {
    TOOL_STARTER_NAME,
    createToolStarterFiles,
    toolStarterMeta,
  } from "./toolStarter";
  import {
    SESSION_HOST_STARTER_NAME,
    createSessionHostStarterFiles,
  } from "./sessionHostStarter";
  import {
    CODING_ORCH_HOST_STARTER_NAME,
    createCodingOrchestrationHostStarterFiles,
  } from "./codingOrchestrationHostStarter";
  import {
    CODING_ORCH_PROTOCOL_ID,
  } from "./codingOrchestrationApi";
  import {
    CODING_ORCH_WORKER_DEFAULT_ROLE,
    CODING_ORCH_WORKER_STARTER_NAME,
    createCodingOrchestrationWorkerStarterFiles,
  } from "./codingOrchestrationWorkerStarter";
  import {
    SESSION_PARTICIPANT_DEFAULT_ROLE,
    SESSION_PARTICIPANT_STARTER_NAME,
    createSessionParticipantStarterFiles,
  } from "./sessionParticipantStarter";
  import {
    pickBestTool,
    rankToolsForPath,
    readToolPrefs,
    rememberToolForPath,
    type RankedTool,
  } from "./toolMatch";
  import { HostBridgeError, registerHostBridge } from "./hostBridge";
  import type { HostDomSnapshotResult } from "./hostBridge";
  import { createShellHostBridge } from "./shellHostBridge";
  import { registerComputeFilesAccess } from "./computeBridge";
  import {
    getAdmittedCapabilities,
    hydrateAdmittedFromMetas,
  } from "./admittedCapabilities";
  import { declaredCapabilitiesFromFiles } from "./samCapabilitiesDeclare";
  import {
    formatCapabilitiesMessage,
    pendingCapabilities,
    pruneAdmittedToDeclared,
  } from "./samCapabilities";
  import { registerToolBridge, registerScopedDelegateHost } from "./toolBridge";
  import { createShellToolBridge } from "./shellToolBridge";
  import {
    clearDelegateGrant,
    clearDelegateGrantsForTask,
    clearWorkerDelegateGrants,
    getDelegateGrant,
    listDelegateGrants,
    setDelegateGrant,
    setWorkerDelegateGrant,
  } from "./delegateGrantRegistry";
  import {
    clearAllSessionBridges,
    registerSessionBridge,
    SessionBridgeError,
    SESSION_API_VERSION,
    SESSION_CAPABILITIES,
    type SessionBridge,
  } from "./sessionBridge";
  import { SessionRuntime } from "./sessionRuntime";
  import FleetPanel from "./fleet/FleetPanel.svelte";
  import {
    createShellSessionBridge,
    fetchHostSessionDomain,
    fetchHostSessionMeta,
    invalidateHostSessionModuleCache,
    notifyHostSessionOpen,
  } from "./shellSessionBridge";
  import { applyIframeColorScheme } from "./playgroundsTheme";
  import {
    PLAYGROUNDS_BUILT_AT,
    formatPlaygroundsBuiltAt,
  } from "./playgroundsBuildInfo";
  import type { MultiAgentSession } from "./sessionTypes";
  import {
    BINDINGS_DIR,
    BINDINGS_VIRTUAL_LEAF_PATHS,
    isBindingsVirtualPath,
    pathMatchesGrant,
    ToolGrantError,
    type ToolGrantMode,
  } from "./toolGrant";
  import {
    clearCanvasTabs,
    closeMainTab as closeMainTabState,
    EDITOR_TAB,
    EDITOR_TAB_ID,
    findCanvasBySandboxId,
    findGrantCanvasTab,
    getActiveTab,
    getForegroundToolSession,
    listCanvasTabs,
    listMainTabSummaries,
    MainTabsError,
    openCanvasTab,
    setActiveMainTab as setActiveMainTabState,
    toTabSummary,
    type MainTab,
    type MainTabId,
  } from "./mainContentTabs";
  import {
    addBottomSam,
    addBuiltin,
    BOTTOM_BUILTINS,
    BottomDockError,
    bottomSamTabId,
    builtinLabel,
    clearBottomSams,
    isBottomBuiltinId,
    MAX_BOTTOM_SAM,
    migrateBottomDockFromLayout,
    removeBottomSam,
    removeBuiltin,
    sandboxIdFromBottomSamTab,
    type BottomBuiltinId,
    type BottomSamPanel,
    type BottomTabId,
  } from "./bottomDock";
  import type { HostMainTabSummary } from "./hostBridge";
  import {
    appendWorkConsoleLine,
    clearWorkConsoleBuffer,
  } from "./workConsoleBuffer";
  import {
    appendWorkNetworkEntry,
    clearWorkNetworkBuffer,
  } from "./workNetworkBuffer";
  import {
    CONSOLE_LEVEL_FILTERS,
    consoleLinesToText,
    filterConsoleLines,
    formatConsoleTime,
    normalizeConsoleLevel,
    type ConsoleLevelFilter,
    type ConsoleLineView,
  } from "./playgroundsConsoleUi";
  import {
    armCanvasConsoleGate,
    installCanvasConsoleGate,
  } from "./canvasConsoleGate";
  import {
    CONSOLE_CHANNEL_ESM_HOST,
    forEachMirrorConsoleWindow,
  } from "./consoleMirrorBridge";
  import {
    readPlaygroundsPrefs,
    writePlaygroundsPrefs,
    type PlaygroundsPrefs,
  } from "./playgroundsPrefs";
  import { captureDocumentToPng } from "./canvasCapture";
  import { clampDomSnapshotMaxChars } from "./domSnapshot";
  import { disposeHostPythonRunner } from "./hostPython";
  import { disposeHostJsRunner } from "./hostJs";
  import { disposeHostWasiRunner } from "./hostWasi";
  import {
    cloneProject,
    createDir,
    createProject,
    deleteDir,
    deleteFile,
    deleteProject,
    isOpfsSupported,
    listProjectDirs,
    listProjects,
    loadFile,
    loadProjectFiles,
    readMeta,
    renameDir,
    renameFile,
    saveFile,
    syncProjectToolMetaFromHead,
    updateProjectMeta,
    writeAllFiles,
    writeFiles,
  } from "./sandboxAuthority";
  import {
    isInWorkingSet,
    isRecyclableSandbox,
    listWorkingSet,
  } from "./workingSet";
  import {
    basename,
    buildFileTree,
    filesUnderDir,
    guessLanguage,
    isValidDirPath,
    isValidProjectPath,
    joinProjectPath,
    parentDir,
    rewritePathPrefix,
    sortProjectPaths,
  } from "./pathUtils";
  import {
    createStarterFiles,
    DEFAULT_ENTRY,
    fileContentByteLength,
    fileContentToBytes,
    isBinaryContent,
    isBinaryPath,
    isEmptyTextContent,
    isMediaPreviewPath,
    isTextContent,
    mediaPreviewKind,
    mediaPreviewMimeType,
    writeShouldReloadCanvas,
    isAgentManagedProject,
    type FileContent,
    type FileMap,
    type MediaPreviewKind,
    type ProjectMeta,
  } from "./projectTypes";
  import {
    browserDirectoryRootName,
    browserFilesToFileMap,
    downloadBytes,
    fetchUrlToFile,
    filenameFromUrl,
    pathsToZip,
  } from "./workspaceTransfer";
  import {
    PROJECT_STATE_NONE,
    anyStateSelected,
    applyProjectState,
    collectProjectState,
    copyProjectState,
    summarizeStateParts,
    type ProjectStateParts,
  } from "./projectState";
  import {
    downloadBlob,
    filesToZip,
    isSamFilename,
    withSamExtension,
    zipToFiles,
  } from "./zipProject";
  import {
    DEFAULT_OPEN_OPTIONS,
    buildPlaygroundsOpenUrl,
    canBuildOpenUrlFromSource,
    beginSharedBootOpen,
    clearOpenQueryParam,
    defaultNameFromOpenIntent,
    explainOpenFromUrlError,
    fetchSamPackageBytes,
    findSandboxIdByOpenSource,
    parseOpenIntent,
    sourceLabelFromOpenIntent,
    type OpenIntent,
  } from "./openFromUrl";
  import {
    byteToOpenProgress,
    fileListToOpenProgress,
    type OpenTransferProgress,
  } from "./transferProgress";
  import {
    applyPlaygroundsPathsFromLocation,
    isPlaygroundsLegacyMount,
    playgroundsCanonicalHomeUrl,
    playgroundsHomePath,
  } from "./playgroundsPaths";
  import SamCatalogBrowser from "@components/sam-catalog/SamCatalogBrowser.svelte";
  import SamCatalogPicksShelf from "@components/sam-catalog/SamCatalogPicksShelf.svelte";
  import {
    SAM_KIND_LABEL,
    pickRandomCatalogEntry,
    samCatalog,
    samEntryOpenSource,
    samPlaygroundsPicks,
    type SamEntry,
  } from "../../data/samCatalog";
  import {
    canUseWebShare,
    isShareAbort,
    shareOrCopy,
  } from "../../utils/shareOrCopy";
  import { fieldShareOrigin } from "../../utils/playgroundsUrls";

  const MIGRATE_BANNER_SESSION_KEY = "playgrounds-migrate-banner-v1";

  type SaveState = "idle" | "dirty" | "saving" | "saved";

  type InstallConflictChoice = "replace" | "keep";

  type UiDialog =
    | {
        kind: "confirm";
        title: string;
        message: string;
        confirmLabel: string;
        icon: PgIconName;
        tone: "default" | "danger";
        resolve: (ok: boolean) => void;
      }
    | {
        kind: "typeConfirm";
        title: string;
        message: string;
        confirmLabel: string;
        requiredText: string;
        icon: PgIconName;
        resolve: (ok: boolean) => void;
      }
    | {
        kind: "prompt";
        title: string;
        message?: string;
        value: string;
        icon: PgIconName;
        resolve: (value: string | null) => void;
      }
    | {
        kind: "stateMove";
        title: string;
        message: string;
        confirmLabel: string;
        icon: PgIconName;
        resolve: (value: ProjectStateParts | null) => void;
      }
    | {
        kind: "installConflict";
        title: string;
        message: string;
        existingName: string;
        icon: PgIconName;
        resolve: (value: InstallConflictChoice | null) => void;
      };

  const btn =
    "playgrounds-btn inline-flex items-center rounded border border-skin-line bg-transparent px-2 py-1 text-xs font-medium text-skin-base transition-colors hover:border-skin-accent hover:text-skin-accent disabled:cursor-not-allowed disabled:opacity-45";
  const btnIcon =
    "playgrounds-btn inline-flex size-7 shrink-0 items-center justify-center rounded border border-skin-line bg-transparent p-0 text-skin-base transition-colors hover:border-skin-accent hover:text-skin-accent disabled:cursor-not-allowed disabled:opacity-45";
  const chromeIconBtn =
    "inline-flex size-6 shrink-0 items-center justify-center rounded p-0 text-skin-base/45 hover:bg-skin-card hover:text-skin-base disabled:cursor-not-allowed disabled:opacity-40";
  const chromeTextBtn =
    "inline-flex h-6 shrink-0 items-center rounded px-1.5 text-[10px] font-medium text-skin-base/55 hover:bg-skin-card hover:text-skin-base disabled:cursor-not-allowed disabled:opacity-40";
  const chromeTextBtnAccent =
    "inline-flex h-6 shrink-0 items-center rounded px-1.5 text-[10px] font-semibold text-skin-accent hover:bg-skin-accent/10 disabled:cursor-not-allowed disabled:opacity-40";
  const btnPrimary =
    "playgrounds-btn inline-flex items-center rounded border border-skin-accent bg-skin-accent px-2.5 py-1 text-xs font-semibold text-skin-inverted transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45";
  const field =
    "border-skin-base/35 bg-skin-fill focus:border-skin-accent w-full rounded border px-2.5 py-1.5 font-mono text-xs focus:outline-hidden";
  const menuItem =
    "hover:bg-skin-card flex w-full items-center gap-2 whitespace-nowrap px-2.5 py-1.5 text-left text-xs disabled:opacity-45";
  const menuItemDanger =
    "playgrounds-menu-danger flex w-full items-center gap-2 whitespace-nowrap px-2.5 py-1.5 text-left text-xs text-red-700 disabled:opacity-45 dark:text-red-300";
  const menuGroup =
    "text-skin-base/40 px-2.5 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wider uppercase";
  const menuKbd =
    "text-skin-base/35 ml-auto shrink-0 font-mono text-[10px] tracking-tight";
  const menuIcon = "text-skin-base/45 shrink-0";

  const shortcutMod =
    typeof navigator !== "undefined" &&
    (/Mac|iPhone|iPad|iPod/.test(navigator.platform) ||
      /\bMac OS X\b/.test(navigator.userAgent))
      ? "⌘"
      : "Ctrl";
  const shortcutNewProject =
    shortcutMod === "⌘" ? "⌘⇧P" : "Ctrl+Shift+P";

  let supported = $state(true);
  let projects = $state<ProjectMeta[]>([]);
  let activeId = $state<string | null>(null);
  let meta = $state<ProjectMeta | null>(null);
  let files = $state<FileMap>({});
  /** OPFS directories including empty ones (approach A). */
  let dirs = $state<string[]>([]);
  /** Selected directory for upload / new-file context (null = project root). */
  let selectedDir = $state<string | null>(null);
  let expandedDirs = $state<Record<string, boolean>>({});
  /** Files sidebar path filter (substring on path / basename). */
  let filesFilterQuery = $state("");
  let uploadInputEl = $state<HTMLInputElement | null>(null);
  let uploadDirInputEl = $state<HTMLInputElement | null>(null);
  let openPath = $state<string | null>(null);
  let draft = $state("");
  let status = $state("就緒");
  let platformFieldLoggedIn = $state(false);
  const builtAtLabel = PLAYGROUNDS_BUILT_AT
    ? formatPlaygroundsBuiltAt(PLAYGROUNDS_BUILT_AT)
    : "";

  function syncPlatformFieldLoginState() {
    platformFieldLoggedIn = hasPlatformFieldApiKey();
  }

  function logoutPlatformField() {
    clearPlatformFieldApiKey();
    status = "已登出遊樂場通行證";
  }

  function platformLoginHref(): string {
    return platformFieldLoginUrl(
      typeof location !== "undefined" ? location.origin : ""
    );
  }
  let error = $state<string | null>(null);
  let consoleLines = $state<ConsoleLineView[]>([]);
  let consoleLevelFilter = $state<ConsoleLevelFilter>("all");
  let consoleQuery = $state("");
  let consoleScrollLocked = $state(false);
  let consoleListEl = $state<HTMLDivElement | null>(null);
  let previewError = $state<string | null>(null);
  let shellPrefs = $state<PlaygroundsPrefs>(readPlaygroundsPrefs());
  let settingsDialogEl = $state<HTMLDialogElement | null>(null);
  let inventoryDialogEl = $state<HTMLDialogElement | null>(null);
  let inventoryFilter = $state("");
  /** Top-level manage dialog: inventory (DEC-028) | fleet (DEC-032). */
  let manageMainTab = $state<"inventory" | "fleet">("inventory");
  /** all | working | recyclable | lineage */
  let inventorySection = $state<"all" | "working" | "recyclable" | "lineage">(
    "all"
  );
  let githubUrl = $state("");
  /** Project dialog: paste `.sam` / GitHub to open now or copy deep link. */
  let openShareSource = $state("");
  /** Boot / dialog: deep-link import in progress (shows banner). */
  let openingFromUrl = $state(false);
  /** Download／file-fetch progress while `openingFromUrl` (null = hide bar detail). */
  let openTransferProgress = $state<OpenTransferProgress | null>(null);
  /** True after first boot finished; enables `astro:page-load` open handling. */
  let openFromUrlBootReady = false;
  /** OPFS／boot 完成前不渲染空狀態，避免有沙盒時閃一下「玩玩看」。 */
  let shellBootReady = $state(false);
  /** Dismissible「先玩一款」橫幅（僅按 X 關閉；開小品不應讓入口消失）。 */
  /** v2: opening a pick no longer writes dismiss; bump so old auto-dismiss resets. */
  const PLAY_WELCOME_KEY = "playgrounds-play-welcome-v2";
  let playWelcomeVisible = $state(false);
  /** DEC-041: legacy blog mount tip (session-dismissible). */
  let migrateBannerVisible = $state(false);
  const playPicks = samPlaygroundsPicks();
  let newProjectName = $state("");
  /** Built-in starter for「以範本建立」(incl. former blank = 一般). */
  type ProjectTemplateId =
    | "general"
    | "agent"
    | "tool"
    | "session-host"
    | "session-participant"
    | "coding-orch-host"
    | "coding-orch-worker";
  const PROJECT_TEMPLATES: {
    id: ProjectTemplateId;
    label: string;
    hint: string;
  }[] = [
    { id: "general", label: "一般", hint: "基礎單頁小程式（SAM）" },
    {
      id: "agent",
      label: "Agent",
      hint: "背景／主動運行；不必用 LLM",
    },
    { id: "tool", label: "工具", hint: "掛進 Editor 的 Tool SAM" },
    { id: "session-host", label: "主持", hint: "多人通道 Host 示範" },
    {
      id: "session-participant",
      label: "參與",
      hint: "多人通道參與者示範",
    },
    {
      id: "coding-orch-host",
      label: "Coding 編排",
      hint: "coding-orchestration.v1 Host（邀請制）",
    },
    {
      id: "coding-orch-worker",
      label: "Coding worker",
      hint: "編排用 LLM worker（BYOK；可退回規則）",
    },
  ];
  let newProjectTemplate = $state<ProjectTemplateId>("general");
  let busy = $state(false);
  let projectDialogOpen = $state(false);
  let catalogBrowserOpen = $state(false);
  let catalogBrowserEl = $state<HTMLDialogElement | null>(null);
  let canWebShare = $state(false);
  let projectPickerOpen = $state(false);
  /** Prefix filter while the dropdown is open (empty = show all). */
  let projectPickerFilter = $state("");
  let projectPickerIndex = $state(0);
  let projectPickerWrapEl = $state<HTMLDivElement | null>(null);
  let projectPickerFilterEl = $state<HTMLInputElement | null>(null);
  let actionsMenuOpen = $state(false);
  let actionsMenuWrapEl = $state<HTMLDivElement | null>(null);
  let bottomPanelOpen = $state(false);
  let bottomPanelMaximized = $state(false);
  /** DEC-044: opt-in dock (Console always; builtins／SAM explicit). */
  let enabledBottomBuiltins = $state<BottomBuiltinId[]>([]);
  let bottomSamPanels = $state<BottomSamPanel[]>([]);
  let bottomTab = $state<BottomTabId>("console");
  let addBottomPanelDialogOpen = $state(false);
  let addBottomPanelDialogEl = $state<HTMLDialogElement | null>(null);
  let addBottomSamPickId = $state("");
  /** Left sidebar: file tree vs agent chat vs Avatars. Default Files; restore from layout. */
  let sidebarTab = $state<"files" | "agent" | "avatars">("files");
  /** `#pg=`／`view=canvas`: first paint already play-first (no IDE flash). */
  const bootConsumerPlay =
    typeof window !== "undefined" && isConsumerPlayLanding();
  const bootInvitePlay =
    typeof window !== "undefined" && isPlatformInviteLanding();
  let previewOpen = $state(true);
  let previewMaximized = $state(bootConsumerPlay);
  /**
   * Share／試玩進場（`view=canvas`／`#pg=`）：畫布可常駐最大化；型錄／隨機不還原工作區。
   * 唯「看原始碼」清除並 restorePreview。
   */
  let tryPlaySession = $state(bootConsumerPlay);
  /** Platform invite guest: hide preview IDE chrome (traffic lights) too. */
  let invitePlaySession = $state(bootInvitePlay);
  /** Main content (Editor 槽) fills the viewport; mutually exclusive with previewMaximized. */
  let editorMaximized = $state(false);
  /** Hide site header so the sandbox fills the viewport. */
  let sandboxMaximized = $state(false);
  let pythonMounted = $state(false);
  let javascriptMounted = $state(false);
  let shellMounted = $state(false);
  type BottomSamRuntime = {
    files: FileMap;
    meta: ProjectMeta | null;
    error: string | null;
    generation: number;
  };
  let bottomSamRuntimeById = $state<Record<string, BottomSamRuntime>>({});
  const bottomSamIframeById = new Map<string, HTMLIFrameElement>();
  let activeAgentSandboxId = $state<string | null>(null);
  let agentMeta = $state<ProjectMeta | null>(null);
  let agentFiles = $state<FileMap>({});
  let agentPreviewError = $state<string | null>(null);
  /** Leader / follower / solo (DEC-031 Phase 3). */
  let agentRuntimeStatus = $state<AgentRuntimeHubStatus | null>(null);
  let unsubAgentRuntimeRole: (() => void) | null = null;
  let unregRosterInviteAccepted: (() => void) | null = null;
  let unregRosterRemoteAct: (() => void) | null = null;
  let unregRosterHomeSeatReady: (() => void) | null = null;
  let unregPlatformCompose: (() => void) | null = null;
  let unregPlatformInviteShare: (() => void) | null = null;
  let unregPlatformInviteJoin: (() => void) | null = null;
  let inviteShareOpen = $state(false);
  let inviteSharePayload = $state<PlatformInviteSharePayload | null>(null);
  let inviteJoinOpen = $state(false);
  let inviteJoinPayload = $state<PlatformInviteJoinPayload | null>(null);
  let inviteJoinPending = $state(false);
  let inviteJoinBusy = $state(false);
  let inviteJoinError = $state<string | null>(null);
  let inviteJoinRecovery = $state<"open_in_safari" | null>(null);
  let inviteJoinCopyUrl = $state<string | null>(null);
  let inviteJoinStatus = $state<string | null>(null);
  let unsubPlatformFieldCred: (() => void) | null = null;
  let agentIframeEl = $state<HTMLIFrameElement | null>(null);
  /** Agent canvas loaded for this project id; cold while Files tab on boot. */
  let agentUiMountedId: string | null = null;
  /** Agent files changed while tab hidden — rebuild once on next show. */
  let agentCanvasStale = false;
  /** Main content tabs (DEC-030): editor + up to 4 canvas SAMs. */
  let mainTabs = $state<MainTab[]>([EDITOR_TAB]);
  let activeMainTabId = $state<MainTabId>(EDITOR_TAB_ID);
  type CanvasRuntime = {
    files: FileMap;
    meta: ProjectMeta | null;
    error: string | null;
    generation: number;
  };
  let canvasRuntimeByTabId = $state<Record<string, CanvasRuntime>>({});
  const canvasIframeByTabId = new Map<string, HTMLIFrameElement>();
  /** Dialog: open sandbox canvas (plain or as tool). */
  let openMainAsTool = $state(false);
  /** Multi-agent session (DEC-023). */
  const sessionRuntime = new SessionRuntime();
  sessionRuntime.setAfterPublish(items => {
    const session = sessionRuntime.getSession();
    if (!session) return;
    const remotes = session.seats.filter(
      s => s.remote?.peerAgentId && typeof s.remote.peerAgentId === "string"
    );
    if (!remotes.length) return;
    for (const item of items) {
      for (const seat of remotes) {
        try {
          sendRosterRelayPayload(
            {
              kind: SESSION_EVENT_KIND,
              sessionId: item.sessionId,
              seq: item.seq,
              event: item.event,
            },
            seat.remote!.peerAgentId
          );
        } catch {
          /* peer DC may be down */
        }
      }
    }
  });
  let multiAgentSession = $state<MultiAgentSession | null>(null);
  let participantFilesById = $state<Record<string, FileMap>>({});
  /** Stable seat list for background iframes (do not put generation here — avoids attach loops). */
  let participantIframes = $state<{ seatId: string; sandboxId: string }[]>(
    []
  );
  let participantIframeEls = new Map<string, HTMLIFrameElement>();
  /** Canvas snapshot generation per seat; non-reactive to avoid Svelte update loops. */
  const participantGenerations = new Map<string, number>();
  /** Seats that already started (or finished) a canvas mount; prevents attach re-entry loops. */
  const participantMountStarted = new Set<string>();
  /** Dialog: open another project as a tool in the Editor slot. */
  let openToolDialogOpen = $state(false);
  let openToolDialogEl = $state<HTMLDialogElement | null>(null);
  let openToolSandboxId = $state("");
  let openToolPath = $state("");
  let openToolMode = $state<ToolGrantMode>("readwrite");
  /** Bump when tool prefs change so ranked hints recompute. */
  let toolPrefsTick = $state(0);
  /** HOST setTargetProject override; null = use activeId. */
  let targetProjectOverride = $state<string | null>(null);
  let filesSidebarOpen = $state(!bootConsumerPlay);
  let filesW = $state(216);
  /** Mobile stacked layout: Files panel height (px). Unused on desktop. */
  let filesH = $state(220);
  /** Mobile stacked layout: Preview (畫布) height (px). Unused on desktop. */
  let previewH = $state(240);
  let editorFrac = $state(0.53);
  let bottomPanelH = $state(140);
  /** Height to restore after leaving maximized bottom panel. */
  let bottomPanelHRestored = $state(140);
  let resizeEdge = $state<"files" | "preview" | "bottom" | null>(null);
  let saveState = $state<SaveState>("idle");
  let dialogEl = $state<HTMLDialogElement | null>(null);
  let secretsDialogEl = $state<HTMLDialogElement | null>(null);
  let secretsDialogOpen = $state(false);
  let secretStoreStatus = $state<SecretStoreStatus>({ state: "absent" });
  let secretMetas = $state<SecretMeta[]>([]);
  let secretNameDraft = $state("");
  let secretValueDraft = $state("");
  let storePasswordDraft = $state("");
  let storePasswordConfirm = $state("");
  /** Password re-entry when registering WebAuthn while unlocked. */
  let webauthnRegisterPassword = $state("");
  let webauthnPrfAvailable = $state(false);
  let webauthnPrfReason = $state("");
  /** Prefill name when steward opens editor for create/rotate. */
  let secretEditorIntent = $state<"manage" | "create" | "rotate">("manage");
  let uiDialogEl = $state<HTMLDialogElement | null>(null);
  let uiDialog = $state<UiDialog | null>(null);
  let uiPromptDraft = $state("");
  let uiStateDraft = $state<ProjectStateParts>({ ...PROJECT_STATE_NONE });
  let iframeEl = $state<HTMLIFrameElement | null>(null);
  const pendingDomSnapshots = new Map<
    string,
    {
      resolve: (v: HostDomSnapshotResult) => void;
      reject: (e: unknown) => void;
      timer: number;
    }
  >();
  let workspaceEl = $state<HTMLDivElement | null>(null);
  let editorColEl = $state<HTMLDivElement | null>(null);

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let previewTimer: ReturnType<typeof setTimeout> | null = null;
  let savedTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumps on each canvas sync so iframe reloads after SW snapshot update. */
  let canvasGeneration = 0;
  let agentCanvasGeneration = 0;
  let canvasSwReady = false;
  let unregisterCanvasApi: (() => void) | null = null;

  const activeMainTab = $derived(getActiveTab(mainTabs, activeMainTabId));
  const activeCanvasTab = $derived(
    activeMainTab.kind === "canvas" ? activeMainTab : null
  );
  const activeToolSession = $derived(
    getForegroundToolSession(mainTabs, activeMainTabId)
  );
  const activeCanvasRuntime = $derived(
    activeCanvasTab ? (canvasRuntimeByTabId[activeCanvasTab.id] ?? null) : null
  );
  const activeToolLabel = $derived(
    activeCanvasTab?.label ??
      activeCanvasRuntime?.meta?.name ??
      projects.find(p => p.id === activeCanvasTab?.sandboxId)?.name ??
      activeCanvasTab?.sandboxId ??
      null
  );
  const mainTabSummaries = $derived(
    listMainTabSummaries(mainTabs, id => projects.find(p => p.id === id)?.name)
  );

  const activeAgentLabel = $derived(
    agentMeta?.name ??
      projects.find(p => p.id === activeAgentSandboxId)?.name ??
      activeAgentSandboxId
  );
  /** Work project is also the active agent — show linked chrome accent. */
  const canCopyOpenLink = $derived(canBuildOpenUrlFromSource(meta?.source));
  const canOpenShareSource = $derived(
    canBuildOpenUrlFromSource(openShareSource)
  );
  const workIsActiveAgent = $derived(
    Boolean(activeId && activeAgentSandboxId && activeId === activeAgentSandboxId)
  );

  const FILES_MIN = 160;
  const FILES_MAX = 560;
  const FILES_H_MIN = 120;
  const FILES_H_MAX = 420;
  /** Prefer a wider left pane when chatting. */
  const AGENT_SIDEBAR_W = 340;
  const PREVIEW_H_MIN = 120;
  const PREVIEW_H_MAX = 480;
  const EDITOR_FRAC_MIN = 0.22;
  const EDITOR_FRAC_MAX = 0.78;
  const BOTTOM_MIN = 80;
  const BOTTOM_MAX = 480;
  const LAYOUT_KEY = "playgrounds-layout";
  const NARROW_MQ = "(width < 900px)";

  function isNarrowLayout() {
    return (
      typeof window !== "undefined" && window.matchMedia(NARROW_MQ).matches
    );
  }

  function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
  }

  function persistLayout() {
    try {
      localStorage.setItem(
        LAYOUT_KEY,
        JSON.stringify({
          filesW,
          filesH,
          previewH,
          editorFrac,
          bottomPanelH,
          bottomPanelOpen,
          bottomPanelMaximized,
          bottomTab:
            bottomTab === "console" || isBottomBuiltinId(bottomTab)
              ? bottomTab
              : "console",
          enabledBottomBuiltins,
          sidebarTab,
          previewOpen,
          previewMaximized,
          editorMaximized,
          sandboxMaximized,
        })
      );
    } catch {
      /* ignore */
    }
  }

  function syncPageChrome() {
    const page = document.querySelector(".playgrounds-page");
    if (!page) return;
    page.classList.toggle(
      "preview-maximized",
      previewMaximized || editorMaximized
    );
    page.classList.toggle("sandbox-maximized", sandboxMaximized);
  }

  function loadLayout() {
    try {
      const raw =
        localStorage.getItem(LAYOUT_KEY) ?? localStorage.getItem("ide-layout");
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        filesW?: number;
        filesH?: number;
        previewH?: number;
        editorFrac?: number;
        bottomPanelH?: number;
        consoleH?: number;
        terminalH?: number;
        bottomPanelOpen?: boolean;
        bottomPanelMaximized?: boolean;
        consoleOpen?: boolean;
        bottomTab?:
          | "agent"
          | "console"
          | "terminal"
          | "python"
          | "javascript"
          | "shell";
        enabledBottomBuiltins?: string[];
        sidebarTab?: "files" | "agent" | "avatars";
        previewOpen?: boolean;
        previewMaximized?: boolean;
        editorMaximized?: boolean;
        sandboxMaximized?: boolean;
      };
      if (typeof parsed.filesW === "number") {
        filesW = clamp(parsed.filesW, FILES_MIN, FILES_MAX);
      }
      if (typeof parsed.filesH === "number") {
        filesH = clamp(parsed.filesH, FILES_H_MIN, FILES_H_MAX);
      }
      if (typeof parsed.previewH === "number") {
        previewH = clamp(parsed.previewH, PREVIEW_H_MIN, PREVIEW_H_MAX);
      }
      if (typeof parsed.editorFrac === "number") {
        editorFrac = clamp(parsed.editorFrac, EDITOR_FRAC_MIN, EDITOR_FRAC_MAX);
      }
      const height =
        parsed.bottomPanelH ?? parsed.consoleH ?? parsed.terminalH;
      if (typeof height === "number") {
        bottomPanelH = clamp(height, BOTTOM_MIN, BOTTOM_MAX);
        bottomPanelHRestored = bottomPanelH;
      }
      if (typeof parsed.bottomPanelOpen === "boolean") {
        bottomPanelOpen = parsed.bottomPanelOpen;
      } else if (typeof parsed.consoleOpen === "boolean") {
        bottomPanelOpen = parsed.consoleOpen;
      }
      if (typeof parsed.bottomPanelMaximized === "boolean") {
        bottomPanelMaximized = parsed.bottomPanelMaximized;
        if (bottomPanelMaximized) bottomPanelOpen = true;
      }
      if (
        parsed.sidebarTab === "files" ||
        parsed.sidebarTab === "agent" ||
        parsed.sidebarTab === "avatars"
      ) {
        sidebarTab = parsed.sidebarTab;
      } else if ((parsed as { sidebarTab?: string }).sidebarTab === "roster") {
        // Transient mis-key during rename; Avatars tab remains `avatars`
        sidebarTab = "avatars";
      }
      if (parsed.bottomTab === "agent") {
        // Migrate: Agent moved from bottom panel to left sidebar.
        sidebarTab = "agent";
      }
      const dock = migrateBottomDockFromLayout({
        enabledBottomBuiltins: parsed.enabledBottomBuiltins,
        bottomTab: parsed.bottomTab,
      });
      enabledBottomBuiltins = dock.enabledBuiltins;
      bottomTab = dock.activeTabId;
      // Mount UI for restored builtins; do not boot Workers (DEC-044).
      if (enabledBottomBuiltins.includes("python")) pythonMounted = true;
      if (enabledBottomBuiltins.includes("javascript")) javascriptMounted = true;
      if (enabledBottomBuiltins.includes("shell")) shellMounted = true;
      if (typeof parsed.previewOpen === "boolean") {
        previewOpen = parsed.previewOpen;
      }
      if (typeof parsed.previewMaximized === "boolean") {
        previewMaximized = parsed.previewMaximized;
        if (previewMaximized) {
          previewOpen = true;
          bottomPanelMaximized = false;
          editorMaximized = false;
        }
      }
      if (typeof parsed.editorMaximized === "boolean") {
        editorMaximized = parsed.editorMaximized;
        if (editorMaximized) {
          previewMaximized = false;
          bottomPanelMaximized = false;
        }
      }
      if (typeof parsed.sandboxMaximized === "boolean") {
        sandboxMaximized = parsed.sandboxMaximized;
      }
    } catch {
      /* ignore */
    }
  }

  function togglePreviewPanel() {
    if (previewMaximized) {
      restorePreview();
      return;
    }
    previewOpen = !previewOpen;
    persistLayout();
  }

  function maximizePreview() {
    if (editorMaximized) restoreEditor();
    if (bottomPanelMaximized) restoreBottomPanel();
    previewOpen = true;
    previewMaximized = true;
    syncPageChrome();
    persistLayout();
  }

  function restorePreview() {
    if (!previewMaximized) return;
    previewMaximized = false;
    tryPlaySession = false;
    invitePlaySession = false;
    syncPageChrome();
    previewOpen = true;
    persistLayout();
  }

  function togglePreviewMaximize() {
    if (previewMaximized) restorePreview();
    else maximizePreview();
  }

  /** Try-play: reveal IDE (only intentional exit that exposes the shell). */
  function exitTryPlayToWorkspace() {
    tryPlaySession = false;
    invitePlaySession = false;
    restorePreview();
  }

  function enterTryPlayCanvas(opts?: { invite?: boolean }) {
    tryPlaySession = true;
    if (opts?.invite) invitePlaySession = true;
    maximizePreview();
  }

  function maximizeEditor() {
    if (previewMaximized) restorePreview();
    if (bottomPanelMaximized) restoreBottomPanel();
    editorMaximized = true;
    syncPageChrome();
    persistLayout();
  }

  function restoreEditor() {
    if (!editorMaximized) return;
    editorMaximized = false;
    syncPageChrome();
    persistLayout();
  }

  function toggleEditorMaximize() {
    if (editorMaximized) restoreEditor();
    else maximizeEditor();
  }

  function toggleSandboxMaximize() {
    sandboxMaximized = !sandboxMaximized;
    syncPageChrome();
    persistLayout();
  }

  function toggleBottomPanel() {
    if (bottomPanelMaximized) {
      restoreBottomPanel();
    }
    bottomPanelOpen = !bottomPanelOpen;
    persistLayout();
  }

  function maximizeBottomPanel() {
    if (previewMaximized) restorePreview();
    // Keep editorMaximized: bottom panel lives inside the editor column.
    if (!bottomPanelOpen) bottomPanelOpen = true;
    if (!bottomPanelMaximized) {
      bottomPanelHRestored = bottomPanelH;
    }
    bottomPanelMaximized = true;
    persistLayout();
  }

  function restoreBottomPanel() {
    if (!bottomPanelMaximized) return;
    bottomPanelMaximized = false;
    bottomPanelH = clamp(bottomPanelHRestored, BOTTOM_MIN, BOTTOM_MAX);
    bottomPanelOpen = true;
    persistLayout();
  }

  function toggleBottomPanelMaximize() {
    if (bottomPanelMaximized) restoreBottomPanel();
    else maximizeBottomPanel();
  }

  function selectBottomTab(tab: BottomTabId) {
    if (tab === "console") {
      bottomTab = "console";
    } else if (isBottomBuiltinId(tab)) {
      if (!enabledBottomBuiltins.includes(tab)) return;
      bottomTab = tab;
      if (tab === "python") pythonMounted = true;
      if (tab === "javascript") javascriptMounted = true;
      if (tab === "shell") shellMounted = true;
    } else {
      const sid = sandboxIdFromBottomSamTab(tab);
      if (!sid || !bottomSamPanels.some(p => p.sandboxId === sid)) return;
      bottomTab = tab;
      void ensureBottomSamPreview(sid);
    }
    if (!bottomPanelOpen) bottomPanelOpen = true;
    persistLayout();
  }

  function enableBottomBuiltin(id: BottomBuiltinId) {
    enabledBottomBuiltins = addBuiltin(enabledBottomBuiltins, id);
    if (id === "python") pythonMounted = true;
    if (id === "javascript") javascriptMounted = true;
    if (id === "shell") shellMounted = true;
    selectBottomTab(id);
    closeAddBottomPanelDialog();
  }

  function disableBottomBuiltin(id: BottomBuiltinId) {
    const next = removeBuiltin(enabledBottomBuiltins, bottomTab, id);
    enabledBottomBuiltins = next.enabledBuiltins;
    bottomTab = next.activeTabId;
    if (id === "python") pythonMounted = false;
    if (id === "javascript") {
      javascriptMounted = false;
      disposeHostJsRunner();
    }
    if (id === "shell") {
      shellMounted = false;
      disposeHostWasiRunner();
    }
    persistLayout();
  }

  function bottomDockCandidateProjects(): ProjectMeta[] {
    const mainIds = new Set(
      listCanvasTabs(mainTabs).map(t => t.sandboxId)
    );
    const bottomIds = new Set(bottomSamPanels.map(p => p.sandboxId));
    return projects.filter(
      p =>
        p.id !== activeId &&
        p.id !== activeAgentSandboxId &&
        !mainIds.has(p.id) &&
        !bottomIds.has(p.id)
    );
  }

  function closeAddBottomPanelDialog() {
    addBottomPanelDialogOpen = false;
    try {
      addBottomPanelDialogEl?.close();
    } catch {
      /* ignore */
    }
  }

  function openAddBottomPanelDialog() {
    addBottomSamPickId = bottomDockCandidateProjects()[0]?.id ?? "";
    addBottomPanelDialogOpen = true;
    error = null;
    queueMicrotask(() => addBottomPanelDialogEl?.showModal());
  }

  function blankBottomSamIframe(sandboxId: string) {
    const el = bottomSamIframeById.get(sandboxId);
    if (!el) return;
    el.removeAttribute("srcdoc");
    el.src = "about:blank";
  }

  function bindBottomSamIframe(
    sandboxId: string,
    el: HTMLIFrameElement | null
  ) {
    if (el) bottomSamIframeById.set(sandboxId, el);
    else bottomSamIframeById.delete(sandboxId);
  }

  function bottomSamIframeAction(
    node: HTMLIFrameElement,
    sandboxId: string
  ) {
    bindBottomSamIframe(sandboxId, node);
    return {
      destroy() {
        bindBottomSamIframe(sandboxId, null);
      },
    };
  }

  async function ensureBottomSamPreview(sandboxId: string) {
    let rt = bottomSamRuntimeById[sandboxId];
    if (!rt) {
      try {
        const pMeta = await readMeta(sandboxId);
        const pFiles = await loadProjectFiles(sandboxId);
        rt = {
          files: pFiles,
          meta: pMeta,
          error: null,
          generation: 0,
        };
        bottomSamRuntimeById = {
          ...bottomSamRuntimeById,
          [sandboxId]: rt,
        };
      } catch (e) {
        bottomSamRuntimeById = {
          ...bottomSamRuntimeById,
          [sandboxId]: {
            files: {},
            meta: null,
            error: e instanceof Error ? e.message : String(e),
            generation: 0,
          },
        };
        return;
      }
    }
    await tick();
    await rebuildBottomSamPreview(sandboxId);
  }

  async function rebuildBottomSamPreview(sandboxId: string) {
    const rt = bottomSamRuntimeById[sandboxId];
    const iframe = bottomSamIframeById.get(sandboxId);
    if (!rt || !iframe) return;
    if (!(DEFAULT_ENTRY in rt.files)) {
      bottomSamRuntimeById = {
        ...bottomSamRuntimeById,
        [sandboxId]: {
          ...rt,
          error: `沙盒缺少 ${DEFAULT_ENTRY}`,
        },
      };
      return;
    }
    try {
      if (!canvasSwReady) {
        await ensureCanvasServiceWorker();
        canvasSwReady = true;
      }
      const generation = rt.generation + 1;
      await syncCanvasSnapshot(sandboxId, generation, rt.files);
      await assertCanvasEntryServed(sandboxId, generation, DEFAULT_ENTRY);
      bottomSamRuntimeById = {
        ...bottomSamRuntimeById,
        [sandboxId]: { ...rt, generation, error: null },
      };
      iframe.removeAttribute("srcdoc");
      iframe.src = buildCanvasEntryUrl(sandboxId, generation, DEFAULT_ENTRY);
      armCanvasConsoleGate(iframe, shellPrefs.mirrorConsoleToBrowser);
    } catch (e) {
      bottomSamRuntimeById = {
        ...bottomSamRuntimeById,
        [sandboxId]: {
          ...rt,
          error: e instanceof Error ? e.message : String(e),
        },
      };
      blankBottomSamIframe(sandboxId);
    }
  }

  function clearAllBottomSamPanels() {
    for (const p of bottomSamPanels) {
      blankBottomSamIframe(p.sandboxId);
      bottomSamIframeById.delete(p.sandboxId);
    }
    const cleared = clearBottomSams(bottomTab);
    bottomSamPanels = cleared.samPanels;
    bottomTab = cleared.activeTabId;
    bottomSamRuntimeById = {};
  }

  async function addBottomSamPanel(sandboxId: string) {
    const label =
      projects.find(p => p.id === sandboxId)?.name ?? sandboxId;
    try {
      const next = addBottomSam(bottomSamPanels, {
        sandboxId,
        label,
        mainSandboxIds: listCanvasTabs(mainTabs).map(t => t.sandboxId),
        stewardSandboxId: activeAgentSandboxId,
        workSandboxId: activeId,
      });
      bottomSamPanels = next.samPanels;
      bottomTab = next.activeTabId;
      if (!bottomPanelOpen) bottomPanelOpen = true;
      status = `下方面板：${label}`;
      closeAddBottomPanelDialog();
      persistLayout();
      await ensureBottomSamPreview(sandboxId);
    } catch (e) {
      error =
        e instanceof BottomDockError || e instanceof Error
          ? e.message
          : String(e);
    }
  }

  function removeBottomSamPanel(sandboxId: string) {
    try {
      blankBottomSamIframe(sandboxId);
      bottomSamIframeById.delete(sandboxId);
      const { [sandboxId]: _drop, ...rest } = bottomSamRuntimeById;
      bottomSamRuntimeById = rest;
      const next = removeBottomSam(bottomSamPanels, bottomTab, sandboxId);
      bottomSamPanels = next.samPanels;
      bottomTab = next.activeTabId;
      persistLayout();
    } catch (e) {
      error =
        e instanceof BottomDockError || e instanceof Error
          ? e.message
          : String(e);
    }
  }

  function selectSidebarTab(
    tab: "files" | "agent" | "avatars",
    opts?: { ensureAgent?: boolean }
  ) {
    sidebarTab = tab;
    if (!filesSidebarOpen) {
      filesSidebarOpen = true;
      try {
        localStorage.setItem("playgrounds-files-sidebar", "1");
      } catch {
        /* ignore */
      }
    }
    if (tab === "agent" && filesW < AGENT_SIDEBAR_W) {
      filesW = clamp(AGENT_SIDEBAR_W, FILES_MIN, FILES_MAX);
    }
    persistLayout();
    // User clicked Agent tab → mount if cold. applyActiveAgent(reveal) skips ensure
    // to avoid re-entering applyActiveAgent.
    if (tab === "agent" && opts?.ensureAgent !== false) {
      void tick().then(() => ensureAgentCanvas());
    }
  }

  /** Open left Agent chat without covering Editor / Preview / Console. */
  function revealAgentPanel() {
    selectSidebarTab("agent", { ensureAgent: false });
  }

  function agentCanvasIsLive(): boolean {
    if (!activeAgentSandboxId || agentUiMountedId !== activeAgentSandboxId) {
      return false;
    }
    const src = agentIframeEl?.src ?? "";
    return Boolean(src) && src !== "about:blank";
  }

  /**
   * Mount Agent iframe on first visit; keep it warm across Files↔Agent switches.
   * Rebuild only when cold, blank, or marked stale (files changed while hidden).
   */
  async function ensureAgentCanvas() {
    if (!activeAgentSandboxId || sidebarTab !== "agent") return;
    if (agentCanvasIsLive() && !agentCanvasStale) return;
    if (agentUiMountedId === activeAgentSandboxId) {
      agentCanvasStale = false;
      await rebuildAgentPreview();
      return;
    }
    await applyActiveAgent(activeAgentSandboxId, { reveal: false });
  }

  function showAndRebuildPreview() {
    if (!previewOpen) {
      previewOpen = true;
      persistLayout();
    }
    consoleLines = [];
    previewError = null;
    void rebuildPreview();
  }

  const filteredConsoleLines = $derived(
    filterConsoleLines(consoleLines, {
      level: consoleLevelFilter,
      query: consoleQuery,
    })
  );

  function pushWorkConsoleLine(level: string, text: string): void {
    const normalized = normalizeConsoleLevel(level);
    const entry = appendWorkConsoleLine(normalized, text);
    consoleLines = [
      ...consoleLines.slice(-300),
      { level: entry.level, text: entry.text, at: entry.at },
    ];
  }

  function postConsoleMirrorToWindow(win: Window | null | undefined): void {
    if (!win) return;
    // Shell-injected gate is authoritative (survives sticky/old SW bridge).
    try {
      installCanvasConsoleGate(win, shellPrefs.mirrorConsoleToBrowser);
    } catch {
      /* opaque / closed */
    }
  }

  function syncConsoleMirrorToCanvases(): void {
    postConsoleMirrorToWindow(iframeEl?.contentWindow);
    postConsoleMirrorToWindow(agentIframeEl?.contentWindow);
    const activeCanvasEl = activeCanvasTab
      ? canvasIframeByTabId.get(activeCanvasTab.id)
      : null;
    postConsoleMirrorToWindow(activeCanvasEl?.contentWindow);
    for (const el of participantIframeEls.values()) {
      postConsoleMirrorToWindow(el.contentWindow);
    }
    forEachMirrorConsoleWindow(win => {
      postConsoleMirrorToWindow(win);
    });
  }

  function onCanvasIframeLoad(ev: Event): void {
    const el = ev.currentTarget;
    if (!(el instanceof HTMLIFrameElement)) return;
    postConsoleMirrorToWindow(el.contentWindow);
    applyIframeColorScheme(el);
  }

  function openSettingsDialog(): void {
    shellPrefs = readPlaygroundsPrefs();
    settingsDialogEl?.showModal();
  }

  function closeSettingsDialog(): void {
    settingsDialogEl?.close();
  }

  function openInventoryDialog(): void {
    inventoryFilter = "";
    inventorySection = "all";
    manageMainTab = "inventory";
    void refreshProjects();
    inventoryDialogEl?.showModal();
  }

  const fleetActiveSeatIds = $derived.by(() => {
    const seats = multiAgentSession?.seats ?? [];
    return new Set(
      seats
        .map(s => s.sandboxId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    );
  });

  const fleetSessionIdBySandbox = $derived.by(() => {
    const map = new Map<string, string>();
    const sess = multiAgentSession;
    if (!sess) return map;
    for (const seat of sess.seats) {
      if (seat.sandboxId) map.set(seat.sandboxId, sess.sessionId);
    }
    return map;
  });

  function closeInventoryDialog(): void {
    inventoryDialogEl?.close();
  }

  function cloneIntentLabel(
    intent: ProjectMeta["cloneIntent"] | undefined
  ): string {
    switch (intent) {
      case "user":
        return "人手複製";
      case "steward_for_user":
        return "總管代建";
      case "self_upgrade":
        return "自迭代";
      case "session_seat":
        return "session 分身";
      case "roster_avatar":
        return "化身投影";
      case "experiment":
        return "試驗";
      default:
        return "";
    }
  }

  function projectNameById(id: string | undefined): string {
    if (!id) return "";
    return projects.find(p => p.id === id)?.name ?? id;
  }

  function filterInventoryProjects(): ProjectMeta[] {
    let list = projects;
    if (inventorySection === "working") {
      list = listWorkingSet(list);
    } else if (inventorySection === "recyclable") {
      list = list.filter(p => isRecyclableSandbox(p, activeAgentSandboxId));
    } else if (inventorySection === "lineage") {
      list = list.filter(p => Boolean(p.clonedFrom));
    }
    const q = inventoryFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.clonedFrom && p.clonedFrom.toLowerCase().includes(q)) ||
        (p.cloneIntent && p.cloneIntent.toLowerCase().includes(q))
    );
  }

  const inventoryProjects = $derived(filterInventoryProjects());
  const recyclableCount = $derived(
    projects.filter(p => isRecyclableSandbox(p, activeAgentSandboxId)).length
  );

  async function setProjectWorkingSet(
    sandboxId: string,
    inWorkingSet: boolean
  ): Promise<void> {
    busy = true;
    error = null;
    try {
      await updateProjectMeta(sandboxId, { inWorkingSet });
      await refreshProjects();
      if (meta?.id === sandboxId) {
        meta = { ...meta, inWorkingSet };
      }
      status = inWorkingSet
        ? `已加入工作集「${projectNameById(sandboxId)}」`
        : `已移出工作集「${projectNameById(sandboxId)}」`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function openFromInventory(sandboxId: string): Promise<void> {
    busy = true;
    error = null;
    try {
      const m = projects.find(p => p.id === sandboxId);
      if (m && !isInWorkingSet(m)) {
        await updateProjectMeta(sandboxId, { inWorkingSet: true });
        await refreshProjects();
      }
      await openProject(sandboxId);
      closeInventoryDialog();
      status = `已開啟「${projectNameById(sandboxId)}」`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function handleCleanupRecyclable(): Promise<void> {
    const targets = projects.filter(p =>
      isRecyclableSandbox(p, activeAgentSandboxId)
    );
    if (targets.length === 0) return;
    const preview = targets
      .slice(0, 8)
      .map(p => p.name)
      .join("、");
    const more =
      targets.length > 8 ? `等 ${targets.length} 個` : `${targets.length} 個`;
    const ok = await askConfirm(
      `刪除可回收沙盒（${more}）：${preview}${targets.length > 8 ? "…" : ""}？無法復原。`,
      {
        title: "清理可回收沙盒",
        confirmLabel: "全部刪除",
        tone: "danger",
        icon: "trash",
      }
    );
    if (!ok) return;
    busy = true;
    error = null;
    try {
      for (const p of targets) {
        await deleteProject(p.id);
        await clearMockKvStore(p.id);
        await clearMockDbStore(p.id);
        await clearCheckpointsForProject(p.id);
        await clearShellStateForDeletedProject(p.id);
      }
      invalidateFunctionsModuleCache();
      await refreshProjects();
      status = `已清理 ${targets.length} 個可回收沙盒`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      await refreshProjects();
    } finally {
      busy = false;
    }
  }

  /** Wipe all Playgrounds local state → first-visit empty (DEC-040). Not on HOST. */
  async function handleFactoryResetPlaygrounds(): Promise<void> {
    // Close inventory first — nested <dialog showModal> stacks race with chained confirms.
    closeInventoryDialog();
    const ok = await askTypeConfirm(
      "這會刪除這個瀏覽器裡遊樂場的全部沙盒、執行期狀態（KV／DB／checkpoints／Agent runtime）、密鑰庫，以及介面偏好與版面設定，回到第一次開啟遊樂場時的空場。無法復原。若曾用生物識別解鎖，裝置上可能還留著已失效的通行密鑰。",
      {
        title: "重置遊樂場",
        confirmLabel: "重置遊樂場",
        requiredText: "DELETE",
        icon: "trash",
      }
    );
    if (!ok) return;
    busy = true;
    error = null;
    status = "正在重置遊樂場…";
    try {
      await resetPlaygroundsToFirstVisit();
      location.assign(playgroundsHomePath());
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      status = "重置失敗";
      busy = false;
    }
  }

  function setMirrorConsoleToBrowser(enabled: boolean): void {
    shellPrefs = {
      ...shellPrefs,
      mirrorConsoleToBrowser: enabled,
    };
    writePlaygroundsPrefs(shellPrefs);
    syncConsoleMirrorToCanvases();
  }

  function onConsoleListScroll(): void {
    const el = consoleListEl;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 28;
    consoleScrollLocked = !nearBottom;
  }

  function scrollConsoleToBottom(): void {
    const el = consoleListEl;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    consoleScrollLocked = false;
  }

  async function copyFilteredConsole(): Promise<void> {
    const text = consoleLinesToText(filteredConsoleLines);
    if (!text) {
      status = "Console 無內容可複製";
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      status = `已複製 ${filteredConsoleLines.length} 行 Console`;
    } catch {
      status = "無法複製到剪貼簿";
    }
  }

  $effect(() => {
    const n = filteredConsoleLines.length;
    const tab = bottomTab;
    if (consoleScrollLocked || tab !== "console" || n === 0) return;
    queueMicrotask(() => {
      if (!consoleScrollLocked && consoleListEl) {
        consoleListEl.scrollTop = consoleListEl.scrollHeight;
      }
    });
  });

  function onResizePointerDown(
    edge: "files" | "preview" | "bottom",
    ev: PointerEvent
  ) {
    if (edge === "files" && !filesSidebarOpen) return;
    if (edge === "preview" && (!previewOpen || previewMaximized)) return;
    if (editorMaximized) return;
    ev.preventDefault();
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    resizeEdge = edge;
  }

  function onResizePointerMove(ev: PointerEvent) {
    if (!resizeEdge) return;
    if (!workspaceEl) return;
    const rect = workspaceEl.getBoundingClientRect();
    if (resizeEdge === "files") {
      if (isNarrowLayout()) {
        const reserve = previewOpen ? previewH + 180 : 160;
        const maxH = Math.min(
          FILES_H_MAX,
          Math.max(FILES_H_MIN, rect.height - reserve)
        );
        filesH = clamp(ev.clientY - rect.top, FILES_H_MIN, maxH);
      } else {
        filesW = clamp(ev.clientX - rect.left, FILES_MIN, FILES_MAX);
      }
      return;
    }
    if (resizeEdge === "preview") {
      if (isNarrowLayout()) {
        // Divider sits above 畫布; drag sets preview height from bottom.
        const reserve = (filesSidebarOpen ? filesH : 40) + 160;
        const maxH = Math.min(
          PREVIEW_H_MAX,
          Math.max(PREVIEW_H_MIN, rect.height - reserve)
        );
        previewH = clamp(rect.bottom - ev.clientY, PREVIEW_H_MIN, maxH);
      } else {
        const filesWidth = filesSidebarOpen ? filesW : 40;
        const gutter = 4;
        const avail = rect.width - filesWidth - gutter * 2;
        if (avail <= 0) return;
        const editorW = ev.clientX - rect.left - filesWidth - gutter;
        editorFrac = clamp(editorW / avail, EDITOR_FRAC_MIN, EDITOR_FRAC_MAX);
      }
      return;
    }
    if (resizeEdge === "bottom" && editorColEl) {
      if (bottomPanelMaximized) return;
      const col = editorColEl.getBoundingClientRect();
      const maxH = Math.min(BOTTOM_MAX, Math.max(BOTTOM_MIN, col.height - 96));
      bottomPanelH = clamp(col.bottom - ev.clientY, BOTTOM_MIN, maxH);
      bottomPanelHRestored = bottomPanelH;
    }
  }

  function onResizePointerUp(ev: PointerEvent) {
    if (!resizeEdge) return;
    try {
      (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    resizeEdge = null;
    persistLayout();
  }

  const workspaceStyle = $derived(
    `--playgrounds-files-w: ${filesW}px; --playgrounds-files-h: ${filesH}px; --playgrounds-preview-h: ${previewH}px; --playgrounds-editor-fr: ${editorFrac}fr; --playgrounds-preview-fr: ${1 - editorFrac}fr; --playgrounds-bottom-h: ${bottomPanelH}px`
  );

  const fileList = $derived(sortProjectPaths(Object.keys(files)));
  /** Virtual Durable entry points (DEC-037); not OPFS source files. */
  const fileTree = $derived(
    buildFileTree(
      [...fileList, ...BINDINGS_VIRTUAL_LEAF_PATHS],
      [...dirs, BINDINGS_DIR]
    )
  );
  const explorerSelectedPath = $derived(selectedDir ?? openPath);

  const filesFilterHits = $derived.by(() => {
    const q = filesFilterQuery.trim().toLowerCase();
    if (!q) return null as { path: string; kind: "file" | "dir" }[] | null;
    const hits: { path: string; kind: "file" | "dir" }[] = [];
    for (const d of dirs) {
      if (
        d.toLowerCase().includes(q) ||
        basename(d).toLowerCase().includes(q)
      ) {
        hits.push({ path: d, kind: "dir" });
      }
    }
    if (
      BINDINGS_DIR.toLowerCase().includes(q) ||
      "bindings".includes(q)
    ) {
      hits.push({ path: BINDINGS_DIR, kind: "dir" });
    }
    for (const p of BINDINGS_VIRTUAL_LEAF_PATHS) {
      if (
        p.toLowerCase().includes(q) ||
        basename(p).toLowerCase().includes(q)
      ) {
        hits.push({ path: p, kind: "file" });
      }
    }
    for (const p of fileList) {
      if (
        p.toLowerCase().includes(q) ||
        basename(p).toLowerCase().includes(q)
      ) {
        hits.push({ path: p, kind: "file" });
      }
    }
    hits.sort((a, b) => a.path.localeCompare(b.path, "en"));
    return hits;
  });

  const openPathBreadcrumbs = $derived.by(() => {
    if (!openPath) return [] as { label: string; dirPath: string | null }[];
    const parts = openPath.split("/").filter(Boolean);
    const out: { label: string; dirPath: string | null }[] = [];
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isLast = i === parts.length - 1;
      if (!isLast) {
        acc = acc ? `${acc}/${part}` : part;
        out.push({ label: part, dirPath: acc });
      } else {
        out.push({ label: part, dirPath: null });
      }
    }
    return out;
  });
  const openPreviewKind = $derived.by((): MediaPreviewKind | null => {
    if (!openPath) return null;
    if (!isBinaryContent(files[openPath] ?? "")) return null;
    return mediaPreviewKind(openPath);
  });
  const editorLanguage = $derived(
    openPath ? (openPreviewKind ?? guessLanguage(openPath)) : "plaintext"
  );

  /** Document title from root index.html `<title>`, for the 畫布 chrome. */
  const canvasDocTitle = $derived.by(() => {
    const raw = files[DEFAULT_ENTRY];
    if (!isTextContent(raw)) return null;
    return extractHtmlTitle(raw);
  });
  const canvasTitleLabel = $derived(canvasDocTitle ?? DEFAULT_ENTRY);

  let mediaPreviewUrl = $state<string | null>(null);

  $effect(() => {
    const path = openPath;
    const content = path ? files[path] : undefined;
    if (
      !path ||
      !isMediaPreviewPath(path) ||
      content === undefined ||
      !isBinaryContent(content)
    ) {
      mediaPreviewUrl = null;
      return;
    }
    const copy = new Uint8Array(content.byteLength);
    copy.set(content);
    const url = URL.createObjectURL(
      new Blob([copy], { type: mediaPreviewMimeType(path) })
    );
    mediaPreviewUrl = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  });

  function mediaPreviewCaption(kind: MediaPreviewKind): string {
    switch (kind) {
      case "image":
        return "圖檔預覽";
      case "pdf":
        return "PDF 預覽（依瀏覽器內建檢視器；部分行動裝置可能無法內嵌）";
      case "audio":
        return "音訊預覽（瀏覽器原生播放器；編碼不支援時無法播放）";
      case "video":
        return "視訊預覽（瀏覽器原生播放器；編碼不支援時無法播放）";
    }
  }
  const saveLabel = $derived.by(() => {
    switch (saveState) {
      case "dirty":
        return "未儲存";
      case "saving":
        return "儲存中…";
      case "saved":
        return "已存 OPFS";
      default:
        return "OPFS";
    }
  });

  async function refreshProjects() {
    projects = await listProjects();
    hydrateAdmittedFromMetas(projects);
  }

  /**
   * Prune admitted to current declaration; ask user for newly declared
   * environment capabilities (DEC-036). Decline → sandbox stays usable without COMPUTE.
   */
  async function maybeReconcileAndAdmitCapabilities(
    sandboxId: string,
    fileMap?: FileMap
  ): Promise<void> {
    const map =
      fileMap ??
      (sandboxId === activeId ? files : await loadProjectFiles(sandboxId));
    const declared = declaredCapabilitiesFromFiles(map);
    let admitted = [...getAdmittedCapabilities(sandboxId)];
    const pruned = pruneAdmittedToDeclared(declared, admitted);
    if (
      pruned.length !== admitted.length ||
      pruned.some((t, i) => t !== admitted[i])
    ) {
      await updateProjectMeta(sandboxId, {
        admittedCapabilities: pruned,
      });
      admitted = pruned;
      if (meta?.id === sandboxId) {
        meta = { ...meta, admittedCapabilities: pruned };
      }
    }
    const pending = pendingCapabilities(declared, admitted);
    if (!pending.length) return;
    const ok = await askConfirm(formatCapabilitiesMessage(pending), {
      title: "授權環境能力",
      confirmLabel: "同意準入",
      icon: "key",
    });
    if (!ok) return;
    const next = [...new Set([...admitted, ...pending])];
    await updateProjectMeta(sandboxId, { admittedCapabilities: next });
    if (meta?.id === sandboxId) {
      meta = { ...meta, admittedCapabilities: next };
    }
  }

  /** Match working-set name/id by case-insensitive substring (DEC-028). */
  function filterWorkingSetByQuery(query: string): ProjectMeta[] {
    const base = listWorkingSet(projects);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      p =>
        p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    );
  }

  const pickerProjects = $derived(filterWorkingSetByQuery(projectPickerFilter));
  const hiddenSandboxCount = $derived(
    projects.filter(p => !isInWorkingSet(p)).length
  );

  function openProjectPicker() {
    if (busy || projects.length === 0) return;
    closeActionsMenu();
    projectPickerOpen = true;
    projectPickerFilter = "";
    const ws = listWorkingSet(projects);
    projectPickerIndex = Math.max(
      0,
      ws.findIndex(p => p.id === activeId)
    );
    void refreshProjects();
    queueMicrotask(() => projectPickerFilterEl?.focus());
  }

  function closeProjectPicker() {
    projectPickerOpen = false;
    projectPickerIndex = 0;
    projectPickerFilter = "";
  }

  function toggleProjectPicker() {
    if (projectPickerOpen) closeProjectPicker();
    else openProjectPicker();
  }

  function openActionsMenu() {
    closeProjectPicker();
    actionsMenuOpen = true;
  }

  function closeActionsMenu() {
    actionsMenuOpen = false;
  }

  function toggleActionsMenu() {
    if (actionsMenuOpen) closeActionsMenu();
    else openActionsMenu();
  }

  function runActionsMenu(action: () => void | Promise<void>) {
    closeActionsMenu();
    void action();
  }

  async function pickProject(id: string) {
    if (busy) return;
    closeProjectPicker();
    if (id === activeId) return;
    busy = true;
    try {
      await openProject(id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  function onProjectPickerFilterInput() {
    projectPickerIndex = 0;
  }

  function onProjectPickerKeydown(ev: KeyboardEvent) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeProjectPicker();
      return;
    }
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      const len = pickerProjects.length;
      if (len === 0) return;
      projectPickerIndex = (projectPickerIndex + 1) % len;
      return;
    }
    if (ev.key === "ArrowUp") {
      ev.preventDefault();
      const len = pickerProjects.length;
      if (len === 0) return;
      projectPickerIndex = (projectPickerIndex - 1 + len) % len;
      return;
    }
    if (ev.key === "Enter") {
      ev.preventDefault();
      const target =
        pickerProjects[projectPickerIndex] ?? pickerProjects[0] ?? null;
      if (target) void pickProject(target.id);
    }
  }

  function onToolbarMenusPointerDown(ev: PointerEvent) {
    if (uiDialog) return;
    const target = ev.target;
    if (!(target instanceof Node)) return;
    if (projectPickerOpen) {
      const wrap = projectPickerWrapEl;
      if (!wrap || !wrap.contains(target)) closeProjectPicker();
    }
    if (actionsMenuOpen) {
      const wrap = actionsMenuWrapEl;
      if (!wrap || !wrap.contains(target)) closeActionsMenu();
    }
  }

  function openProjectDialog(opts?: { template?: ProjectTemplateId }) {
    error = null;
    newProjectTemplate = opts?.template ?? "general";
    void refreshProjects();
    projectDialogOpen = true;
    queueMicrotask(() => dialogEl?.showModal());
  }

  function closeProjectDialog() {
    projectDialogOpen = false;
    dialogEl?.close();
  }

  function openCatalogBrowser() {
    error = null;
    closeProjectDialog();
    catalogBrowserOpen = true;
    queueMicrotask(() => catalogBrowserEl?.showModal());
  }

  function closeCatalogBrowser() {
    catalogBrowserOpen = false;
    catalogBrowserEl?.close();
  }

  function onCatalogBrowserClose() {
    catalogBrowserOpen = false;
  }

  function selectNewProjectTemplate(id: ProjectTemplateId) {
    newProjectTemplate = id;
  }

  function defaultNameForTemplate(id: ProjectTemplateId): string {
    switch (id) {
      case "agent":
        return AGENT_BASE_STARTER_NAME;
      case "tool":
        return TOOL_STARTER_NAME;
      case "session-host":
        return SESSION_HOST_STARTER_NAME;
      case "session-participant":
        return SESSION_PARTICIPANT_STARTER_NAME;
      case "coding-orch-host":
        return CODING_ORCH_HOST_STARTER_NAME;
      case "coding-orch-worker":
        return CODING_ORCH_WORKER_STARTER_NAME;
      default:
        return `沙盒 ${projects.length + 1}`;
    }
  }

  function inferPromptIcon(title: string): PgIconName {
    if (title.includes("資料夾")) return "folderPlus";
    if (title.includes("檔案")) return "filePlus";
    if (title.includes("URL") || title.includes("網址")) return "link";
    if (title.includes("路徑")) return "folder";
    if (title.includes("命名")) return "pencil";
    return "pencil";
  }

  function onceResolve<T>(resolve: (value: T) => void): (value: T) => void {
    let settled = false;
    return (value: T) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
  }

  /** In-app modal confirm — never use window.confirm. */
  function askConfirm(
    message: string,
    options?: {
      title?: string;
      confirmLabel?: string;
      icon?: PgIconName;
      tone?: "default" | "danger";
    }
  ): Promise<boolean> {
    return new Promise(resolve => {
      const tone = options?.tone ?? "default";
      uiDialog = {
        kind: "confirm",
        title: options?.title ?? "確認",
        message,
        confirmLabel: options?.confirmLabel ?? "確定",
        icon: options?.icon ?? (tone === "danger" ? "trash" : "alertTriangle"),
        tone,
        resolve: onceResolve(resolve),
      };
      queueMicrotask(() => uiDialogEl?.showModal());
    });
  }

  /**
   * Danger confirm that requires typing `requiredText` (e.g. 重置).
   * Single dialog — avoids nested inventory + confirm→prompt races.
   */
  function askTypeConfirm(
    message: string,
    options: {
      title?: string;
      confirmLabel?: string;
      requiredText: string;
      icon?: PgIconName;
    }
  ): Promise<boolean> {
    return new Promise(resolve => {
      uiPromptDraft = "";
      uiDialog = {
        kind: "typeConfirm",
        title: options.title ?? "確認",
        message,
        confirmLabel: options.confirmLabel ?? "確定",
        requiredText: options.requiredText,
        icon: options.icon ?? "trash",
        resolve: onceResolve(resolve),
      };
      queueMicrotask(() => {
        uiDialogEl?.showModal();
        const input = uiDialogEl?.querySelector("input");
        if (input instanceof HTMLInputElement) {
          input.focus();
        }
      });
    });
  }

  /** In-app modal prompt — never use window.prompt. */
  function askPrompt(
    title: string,
    initial: string,
    message?: string,
    options?: { icon?: PgIconName }
  ): Promise<string | null> {
    return new Promise(resolve => {
      uiPromptDraft = initial;
      uiDialog = {
        kind: "prompt",
        title,
        message,
        value: initial,
        icon: options?.icon ?? inferPromptIcon(title),
        resolve: onceResolve(resolve),
      };
      queueMicrotask(() => {
        uiDialogEl?.showModal();
        const input = uiDialogEl?.querySelector("input");
        if (input instanceof HTMLInputElement) {
          input.focus();
          input.select();
        }
      });
    });
  }

  /**
   * Same-source install already present: replace (full wipe, same id) or
   * keep existing and install into a new sandbox id. Cancel → null.
   */
  function askInstallConflict(options: {
    existingName: string;
    sourceLabel?: string;
  }): Promise<InstallConflictChoice | null> {
    const sourceHint = options.sourceLabel?.trim()
      ? `來源：${options.sourceLabel.trim()}`
      : "";
    return new Promise(resolve => {
      uiDialog = {
        kind: "installConflict",
        title: "本機已有相同來源",
        message: sourceHint
          ? `此來源的 SAM 已安裝在本機。要取代既有沙盒，或保留既有並另裝到新沙盒？\n${sourceHint}`
          : "此來源的 SAM 已安裝在本機。要取代既有沙盒，或保留既有並另裝到新沙盒？",
        existingName: options.existingName,
        icon: "layers",
        resolve: onceResolve(resolve),
      };
      queueMicrotask(() => uiDialogEl?.showModal());
    });
  }

  /**
   * Full wipe — same cleanup as UI「刪除沙盒」
   * (OPFS recursive remove + KV／DB／checkpoint + shell bindings).
   * Used by delete UI and by「取代」before recreate under the same id.
   */
  async function deleteInstalledSandboxFully(id: string): Promise<void> {
    await deleteProject(id);
    await clearMockKvStore(id);
    await clearMockDbStore(id);
    await clearCheckpointsForProject(id);
    invalidateFunctionsModuleCache();
    await clearShellStateForDeletedProject(id);
  }

  /**
   * Choose which durable stores (KV / DB) to move with source files.
   * Default is none — opt-in per store. Cancel → null.
   */
  function askStateMove(
    title: string,
    message: string,
    options?: {
      confirmLabel?: string;
      icon?: PgIconName;
      initial?: ProjectStateParts;
    }
  ): Promise<ProjectStateParts | null> {
    return new Promise(resolve => {
      uiStateDraft = { ...(options?.initial ?? PROJECT_STATE_NONE) };
      uiDialog = {
        kind: "stateMove",
        title,
        message,
        confirmLabel: options?.confirmLabel ?? "繼續",
        icon: options?.icon ?? "copy",
        resolve: onceResolve(resolve),
      };
      queueMicrotask(() => uiDialogEl?.showModal());
    });
  }

  function closeUiDialog(
    result: boolean | string | ProjectStateParts | InstallConflictChoice | null
  ) {
    const current = uiDialog;
    if (!current) return;
    // Clear + resolve before close() so a deferred `close` event cannot
    // cancel a newly chained dialog that reuses the same <dialog> element.
    uiDialog = null;
    if (current.kind === "confirm" || current.kind === "typeConfirm") {
      current.resolve(result === true);
    } else if (current.kind === "stateMove") {
      current.resolve(
        result && typeof result === "object" && "kv" in result
          ? result
          : null
      );
    } else if (current.kind === "installConflict") {
      current.resolve(result === "replace" || result === "keep" ? result : null);
    } else {
      current.resolve(typeof result === "string" ? result : null);
    }
    try {
      uiDialogEl?.close();
    } catch {
      /* ignore */
    }
  }

  function onUiDialogClose() {
    if (!uiDialog) return;
    // Esc / backdrop dismiss → cancel
    const current = uiDialog;
    uiDialog = null;
    if (current.kind === "confirm" || current.kind === "typeConfirm") {
      current.resolve(false);
    } else {
      current.resolve(null);
    }
  }

  function submitUiPrompt() {
    if (!uiDialog || uiDialog.kind !== "prompt") return;
    closeUiDialog(uiPromptDraft);
  }

  function submitUiTypeConfirm() {
    if (!uiDialog || uiDialog.kind !== "typeConfirm") return;
    if (uiPromptDraft.trim() !== uiDialog.requiredText) return;
    closeUiDialog(true);
  }

  function submitUiStateMove() {
    if (!uiDialog || uiDialog.kind !== "stateMove") return;
    closeUiDialog({ ...uiStateDraft });
  }

  function projectFilesAreEmpty(map: FileMap): boolean {
    const paths = Object.keys(map);
    if (paths.length === 0) return true;
    return paths.every(p => isEmptyTextContent(map[p]));
  }

  function draftFromContent(content: FileContent | undefined): string {
    if (content === undefined) return "";
    if (isTextContent(content)) return content;
    return "";
  }

  function openFileIsBinary(): boolean {
    if (!openPath) return false;
    const content = files[openPath];
    if (content !== undefined) return isBinaryContent(content);
    return isBinaryPath(openPath);
  }

  async function refreshDirs(id: string = activeId ?? "") {
    if (!id) {
      dirs = [];
      return;
    }
    dirs = await listProjectDirs(id);
  }

  function expandAncestors(path: string | null) {
    if (!path) return;
    const next = { ...expandedDirs };
    let cur = parentDir(path);
    while (cur) {
      next[cur] = true;
      cur = parentDir(cur);
    }
    // Also expand the path itself when it is a directory.
    if (dirs.includes(path)) next[path] = true;
    expandedDirs = next;
  }

  /** Expand only ancestors of path (smart default for large trees). */
  function expandOnlyAncestors(path: string | null) {
    const next: Record<string, boolean> = {};
    if (path) {
      let cur = parentDir(path);
      while (cur) {
        next[cur] = true;
        cur = parentDir(cur);
      }
      if (dirs.includes(path)) next[path] = true;
    }
    expandedDirs = next;
  }

  function collapseAllDirs() {
    if (openPath) expandOnlyAncestors(openPath);
    else if (selectedDir) expandOnlyAncestors(selectedDir);
    else expandedDirs = {};
  }

  function contextDir(): string {
    if (selectedDir) return selectedDir;
    if (openPath) return parentDir(openPath);
    return "";
  }

  function toggleExpandedDir(path: string) {
    expandedDirs = { ...expandedDirs, [path]: !expandedDirs[path] };
  }

  function selectExplorerFile(path: string) {
    selectedDir = null;
    selectFile(path);
    expandAncestors(path);
  }

  function selectExplorerDir(path: string) {
    selectedDir = path;
    expandAncestors(path);
    if (!expandedDirs[path]) {
      expandedDirs = { ...expandedDirs, [path]: true };
    }
  }

  function notifyAgentWorkProject(sandboxId: string | null) {
    const win = agentIframeEl?.contentWindow;
    if (!win || !sandboxId) return;
    const projectName =
      (activeId === sandboxId ? meta?.name : null) ??
      projects.find(p => p.id === sandboxId)?.name ??
      null;
    try {
      win.postMessage(
        {
          type: "playgrounds-agent-work-project",
          sandboxId,
          projectName,
        },
        "*"
      );
    } catch {
      /* ignore */
    }
  }

  async function openProject(id: string) {
    error = null;
    await flushSave();
    await clearAllMainCanvasTabs();
    clearAllBottomSamPanels();
    if (multiAgentSession) {
      await closeMultiAgentSession();
    }
    invalidateFunctionsModuleCache();
    activeId = id;
    writeActiveWorkSandboxId(id);
    meta = await syncProjectToolMetaFromHead(id);
    files = await loadProjectFiles(id);
    await refreshDirs(id);
    // Earlier VM sync / editor races could persist empty shells into OPFS.
    if (projectFilesAreEmpty(files)) {
      const starter = createStarterFiles();
      meta = await writeAllFiles(id, starter);
      files = starter;
      await refreshDirs(id);
      status = `沙盒「${meta.name}」已還原為一般範本檔案`;
    }
    const paths = sortProjectPaths(Object.keys(files));
    const open = DEFAULT_ENTRY in files ? DEFAULT_ENTRY : (paths[0] ?? null);
    openPath = open;
    selectedDir = null;
    filesFilterQuery = "";
    draft = open ? draftFromContent(files[open]) : "";
    expandOnlyAncestors(open);
    saveState = "idle";
    if (!status.startsWith("沙盒「")) status = `沙盒「${meta.name}」`;
    consoleLines = [];
    clearWorkConsoleBuffer();
    clearWorkNetworkBuffer();
    previewError = null;
    closeProjectDialog();
    schedulePreview(true);
    await maybeReconcileAndAdmitCapabilities(id, files);
    notifyAgentWorkProject(id);
    if (activeAgentSandboxId === id) {
      agentFiles = files;
      agentMeta = meta;
      void rebuildAgentPreview();
    }
    // Agent form (DEC-031): attach Controller without requiring 設為總管.
    if (
      fileMapNeedsAgentController(files) &&
      activeAgentSandboxId !== id
    ) {
      void ensureAgentController(id, files, meta?.name);
    }
  }

  /** Attach Controllers for Agent-form SAMs already in the working set (boot). */
  async function ensureWorkingSetAgentControllers(): Promise<void> {
    for (const p of projects) {
      if (!isInWorkingSet(p)) continue;
      if (p.id === activeAgentSandboxId) continue;
      try {
        const pFiles =
          p.id === activeId ? files : await loadProjectFiles(p.id);
        if (fileMapNeedsAgentController(pFiles)) {
          await ensureAgentController(p.id, pFiles, p.name);
        }
      } catch {
        /* skip broken sandboxes */
      }
    }
  }

  async function handleCreateFromTemplate() {
    busy = true;
    error = null;
    try {
      const template = newProjectTemplate;
      const name =
        newProjectName.trim() || defaultNameForTemplate(template);
      const label =
        PROJECT_TEMPLATES.find(t => t.id === template)?.label ?? template;
      let created: ProjectMeta;
      switch (template) {
        case "agent":
          created = await createProject(name, createAgentBaseStarterFiles(), {
            source: "playgrounds-agent-starter",
            inWorkingSet: true,
          });
          // Agent form: register + start Controller (no HOST / 不必設為總管).
          await ensureAgentController(
            created.id,
            createAgentBaseStarterFiles(),
            created.name
          );
          break;
        case "tool":
          created = await createProject(name, createToolStarterFiles(), {
            source: "playgrounds-tool-starter",
            inWorkingSet: true,
            ...toolStarterMeta(),
          });
          break;
        case "session-host":
          created = await createProject(
            name,
            createSessionHostStarterFiles(),
            {
              source: "playgrounds-session-host-starter",
              inWorkingSet: true,
            }
          );
          break;
        case "session-participant":
          created = await createProject(
            name,
            createSessionParticipantStarterFiles(),
            {
              source: "playgrounds-session-participant-starter",
              inWorkingSet: true,
            }
          );
          break;
        case "coding-orch-host":
          created = await createProject(
            name,
            createCodingOrchestrationHostStarterFiles(),
            {
              source: "playgrounds-coding-orch-host-starter",
              inWorkingSet: true,
            }
          );
          break;
        case "coding-orch-worker":
          created = await createProject(
            name,
            createCodingOrchestrationWorkerStarterFiles(),
            {
              source: "playgrounds-coding-orch-worker-starter",
              inWorkingSet: true,
              agentManaged: false,
            }
          );
          await ensureAgentController(
            created.id,
            createCodingOrchestrationWorkerStarterFiles(),
            created.name
          );
          break;
        default:
          created = await createProject(name, createStarterFiles(), {
            inWorkingSet: true,
          });
          break;
      }
      newProjectName = "";
      await refreshProjects();
      closeProjectDialog();
      actionsMenuOpen = false;

      if (template === "tool") {
        const canMount = Boolean(activeId && openPath);
        if (canMount && openPath) {
          const mount = await askConfirm(
            `已用「工具」範本建立「${created.name}」。要以它開啟目前檔案「${openPath}」嗎？`,
            {
              title: "掛載為工具",
              confirmLabel: "開啟工具",
              icon: "sparkles",
            }
          );
          if (mount) {
            await mountToolWithPath(created.id, openPath, "readwrite");
            return;
          }
        }
        status = `已用「${label}」範本建立「${created.name}」（用 Editor「用沙盒開啟」掛載）`;
        return;
      }

      await openProject(created.id);
      if (template === "session-host") {
        status = `已用「${label}」範本建立「${created.name}」；在畫布開始這一場（遊樂場只提供通道 API）`;
      } else if (template === "session-participant") {
        status = `已用「${label}」範本建立「${created.name}」；由主持沙盒加入，或再 clone 多分身`;
      } else if (template === "coding-orch-host") {
        status = `已用「${label}」範本建立「${created.name}」；開始編排後邀請 worker（invite_only）`;
      } else if (template === "coding-orch-worker") {
        status = `已用「${label}」範本建立「${created.name}」；由 Coding 編排 Host 邀請入座`;
      } else {
        status = `已用「${label}」範本建立「${created.name}」`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function handleDeleteProject(id?: string) {
    const targetId = typeof id === "string" && id ? id : activeId;
    if (!targetId) return;
    const targetMeta =
      projects.find(p => p.id === targetId) ??
      (targetId === activeId ? meta : null);
    const label = targetMeta?.name ?? targetId;
    const ok = await askConfirm(
      `刪除本機沙盒「${label}」？無法復原。將一併清除該沙盒的 KV、DB 與 checkpoint（密鑰庫為遊樂場級，不受影響）。`,
      {
        title: "刪除沙盒",
        confirmLabel: "刪除",
        tone: "danger",
        icon: "trash",
      }
    );
    if (!ok) return;
    busy = true;
    try {
      await deleteInstalledSandboxFully(targetId);
      await refreshProjects();
      status = "已刪除沙盒";
      if (!activeId && projects.length > 0) {
        await openProject(projects[0]!.id);
      } else if (!activeId) {
        newProjectTemplate = "general";
        newProjectName = "";
        await handleCreateFromTemplate();
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  function selectFile(path: string) {
    void flushSave().then(() => {
      openPath = path;
      if (isBindingsVirtualPath(path)) {
        // Virtual Durable entry — no OPFS content; open with tool / grant.
        draft = "";
        saveState = "idle";
        return;
      }
      draft = draftFromContent(files[path]);
      saveState = "idle";
    });
  }

  function onDocChange(next: string) {
    if (!openPath || !activeId) return;
    if (isBindingsVirtualPath(openPath)) return;
    const prev = files[openPath];
    if (prev !== undefined && isBinaryContent(prev)) return;
    const prevText = isTextContent(prev) ? prev : "";
    // Ignore editor-init glitches that would wipe a loaded non-empty file.
    if (next === "" && prevText.length > 0 && saveState === "idle") {
      draft = prevText;
      return;
    }
    draft = next;
    files = { ...files, [openPath]: next };
    saveState = "dirty";
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void persistCurrent();
    }, 450);
    schedulePreview(false);
  }

  async function persistCurrent() {
    if (!activeId || !openPath) return;
    if (isBindingsVirtualPath(openPath)) return;
    saveState = "saving";
    try {
      const savedPath = openPath;
      meta = await saveFile(activeId, openPath, files[openPath] ?? "");
      saveState = "saved";
      status = "已寫入 OPFS";
      await refreshProjects();
      if (savedPath === DEFAULT_ENTRY) {
        await maybeReconcileAndAdmitCapabilities(activeId, files);
      }
      if (activeId === activeAgentSandboxId) {
        agentFiles = files;
        agentMeta = meta;
        void rebuildAgentPreview();
      }
      if (savedTimer) clearTimeout(savedTimer);
      savedTimer = setTimeout(() => {
        if (saveState === "saved") saveState = "idle";
      }, 1600);
    } catch (e) {
      saveState = "dirty";
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function flushSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (saveState === "dirty" || saveState === "saving") {
      await persistCurrent();
    }
  }

  function clearPreview() {
    if (iframeEl) {
      iframeEl.removeAttribute("srcdoc");
      iframeEl.src = "about:blank";
    }
  }

  function clearAgentPreview() {
    if (agentIframeEl) {
      agentIframeEl.removeAttribute("srcdoc");
      agentIframeEl.src = "about:blank";
    }
  }

  function blankCanvasIframe(tabId: string) {
    const el = canvasIframeByTabId.get(tabId);
    if (!el) return;
    el.removeAttribute("srcdoc");
    el.src = "about:blank";
  }

  function bindCanvasIframe(tabId: string, el: HTMLIFrameElement | null) {
    if (el) canvasIframeByTabId.set(tabId, el);
    else canvasIframeByTabId.delete(tabId);
  }

  function canvasIframeAction(node: HTMLIFrameElement, tabId: string) {
    bindCanvasIframe(tabId, node);
    return {
      destroy() {
        bindCanvasIframe(tabId, null);
      },
    };
  }

  function summarizeMainTab(tab: MainTab): HostMainTabSummary {
    return toTabSummary(
      tab,
      tab.kind === "canvas"
        ? (canvasRuntimeByTabId[tab.id]?.meta?.name ??
            projects.find(p => p.id === tab.sandboxId)?.name)
        : undefined
    );
  }

  async function rebuildCanvasTabPreview(tabId: string) {
    const tab = findTabById(tabId);
    if (!tab || tab.kind !== "canvas") return;
    const rt = canvasRuntimeByTabId[tabId];
    const iframe = canvasIframeByTabId.get(tabId);
    if (!rt || !iframe) return;
    if (!(DEFAULT_ENTRY in rt.files)) {
      canvasRuntimeByTabId = {
        ...canvasRuntimeByTabId,
        [tabId]: {
          ...rt,
          error: `沙盒缺少 ${DEFAULT_ENTRY}`,
        },
      };
      return;
    }
    try {
      if (!canvasSwReady) {
        await ensureCanvasServiceWorker();
        canvasSwReady = true;
      }
      const generation = rt.generation + 1;
      await syncCanvasSnapshot(tab.sandboxId, generation, rt.files);
      await assertCanvasEntryServed(tab.sandboxId, generation, DEFAULT_ENTRY);
      canvasRuntimeByTabId = {
        ...canvasRuntimeByTabId,
        [tabId]: { ...rt, generation, error: null },
      };
      iframe.removeAttribute("srcdoc");
      iframe.src = buildCanvasEntryUrl(
        tab.sandboxId,
        generation,
        DEFAULT_ENTRY
      );
      armCanvasConsoleGate(iframe, shellPrefs.mirrorConsoleToBrowser);
    } catch (e) {
      canvasRuntimeByTabId = {
        ...canvasRuntimeByTabId,
        [tabId]: {
          ...rt,
          error: e instanceof Error ? e.message : String(e),
        },
      };
      blankCanvasIframe(tabId);
    }
  }

  function findTabById(tabId: string): MainTab | undefined {
    return mainTabs.find(t => t.id === tabId);
  }

  async function applyMainTabsState(next: {
    tabs: MainTab[];
    activeTabId: MainTabId;
  }) {
    const removed = listCanvasTabs(mainTabs).filter(
      t => !next.tabs.some(n => n.id === t.id)
    );
    for (const t of removed) {
      blankCanvasIframe(t.id);
      const { [t.id]: _drop, ...rest } = canvasRuntimeByTabId;
      canvasRuntimeByTabId = rest;
      canvasIframeByTabId.delete(t.id);
    }
    mainTabs = next.tabs;
    activeMainTabId = next.activeTabId;
    // DEC-037：Tool grant 同步進 registry，供 Backend Runtime inject DELEGATE
    // （勿只靠 UI tab／foreground；否則 functionsFetch 常拿不到 grant）。
    const grantTabs = listCanvasTabs(next.tabs).filter(t => t.grant);
    const grantIds = new Set(grantTabs.map(t => t.sandboxId));
    for (const entry of listDelegateGrants()) {
      if (entry.source === "tool" && !grantIds.has(entry.sandboxId)) {
        clearDelegateGrant(entry.sandboxId);
      }
    }
    for (const tab of grantTabs) {
      if (!tab.grant) continue;
      setDelegateGrant({
        sandboxId: tab.sandboxId,
        source: "tool",
        grant: tab.grant,
        focusPath: tab.focusPath,
      });
    }
    invalidateFunctionsModuleCache();
  }

  async function clearAllMainCanvasTabs() {
    for (const tab of listCanvasTabs(mainTabs)) {
      blankCanvasIframe(tab.id);
    }
    for (const entry of listDelegateGrants()) {
      if (entry.source === "tool") clearDelegateGrant(entry.sandboxId);
    }
    const cleared = clearCanvasTabs(mainTabs);
    mainTabs = cleared.tabs;
    activeMainTabId = cleared.activeTabId;
    canvasRuntimeByTabId = {};
    canvasIframeByTabId.clear();
    invalidateFunctionsModuleCache();
  }

  async function openMainCanvasSession(opts: {
    sandboxId: string;
    grant?: {
      hostSandboxId: string;
      paths: string[];
      mode: ToolGrantMode;
    };
    focusPath?: string | null;
  }): Promise<HostMainTabSummary> {
    if (!activeId) {
      throw new MainTabsError("bad_grant", "請先開啟工作沙盒");
    }
    if (opts.sandboxId === activeAgentSandboxId) {
      throw new MainTabsError("bad_grant", "不可將總管掛到主內容區");
    }
    if (bottomSamPanels.some(p => p.sandboxId === opts.sandboxId)) {
      throw new MainTabsError(
        "bad_grant",
        "此沙盒已掛在下方面板，請先移除再掛到主內容"
      );
    }
    if (opts.sandboxId === activeId && !opts.grant) {
      // Plain view of work project is redundant with right preview; still allow?
      // Plan allows any sandboxId; work project as plain is ok but odd. Allow.
    }
    const label =
      projects.find(p => p.id === opts.sandboxId)?.name ?? opts.sandboxId;
    const next = openCanvasTab(mainTabs, activeMainTabId, {
      sandboxId: opts.sandboxId,
      label,
      ...(opts.grant
        ? {
            grant: opts.grant,
            focusPath: opts.focusPath,
          }
        : {}),
    });
    const tab = findCanvasBySandboxId(next.tabs, opts.sandboxId);
    if (!tab) {
      throw new MainTabsError("main_tab_not_found", "開啟畫布 tab 失敗");
    }
    const meta = await readMeta(opts.sandboxId);
    const files = await loadProjectFiles(opts.sandboxId);
    await applyMainTabsState(next);
    canvasRuntimeByTabId = {
      ...canvasRuntimeByTabId,
      [tab.id]: {
        files,
        meta,
        error: null,
        generation: canvasRuntimeByTabId[tab.id]?.generation ?? 0,
      },
    };
    await tick();
    await rebuildCanvasTabPreview(tab.id);
    status = opts.grant
      ? `工具：${meta.name}`
      : `畫布：${meta.name}`;
    return summarizeMainTab(
      findCanvasBySandboxId(mainTabs, opts.sandboxId) ?? tab
    );
  }

  async function closeMainContentTab(tabId?: string) {
    const next = closeMainTabState(mainTabs, activeMainTabId, tabId);
    await applyMainTabsState(next);
  }

  async function selectMainContentTab(tabId: string) {
    const id = setActiveMainTabState(mainTabs, tabId);
    activeMainTabId = id;
    invalidateFunctionsModuleCache();
  }

  async function closeToolSession() {
    const grantTab = listCanvasTabs(mainTabs).find(t => t.grant);
    if (!grantTab) {
      invalidateFunctionsModuleCache();
      return;
    }
    await closeMainContentTab(grantTab.id);
  }

  /**
   * Mount project B as a tool canvas tab without changing activeId.
   * Never calls openProject(toolId).
   */
  async function openToolSession(opts: {
    toolSandboxId: string;
    paths: string[];
    mode: ToolGrantMode;
    focusPath?: string | null;
  }) {
    if (!activeId) {
      throw new ToolGrantError("bad_grant", "請先開啟工作沙盒");
    }
    await openMainCanvasSession({
      sandboxId: opts.toolSandboxId,
      grant: {
        hostSandboxId: activeId,
        paths: opts.paths,
        mode: opts.mode,
      },
      focusPath: opts.focusPath,
    });
  }

  function syncMultiAgentSessionView() {
    const s = sessionRuntime.getSession();
    multiAgentSession = s
      ? { ...s, seats: [...sessionRuntime.listSeats()] }
      : null;
    if (s && (s.status === "open" || s.status === "paused")) {
      setRosterOpenSession({
        sessionId: s.sessionId,
        protocol: s.protocol,
        status: s.status,
      });
    } else {
      setRosterOpenSession(null);
    }
  }

  async function closeMultiAgentSession(opts?: {
    /** Offer to delete session_seat clones (default true). Skip on unmount. */
    offerSeatCleanup?: boolean;
  }) {
    // Notify remote seats before tearing bridges／DC (Guest must see「主持結束」).
    if (sessionRuntime.getSession()) {
      try {
        sessionRuntime.publishEvents([
          { type: "session.closed", reason: "host_closed" },
        ]);
      } catch {
        /* ignore — still close locally */
      }
    }
    const seatSandboxIds = sessionRuntime
      .listSeats()
      .filter(s => s.kind === "agent" && s.sandboxId)
      .map(s => s.sandboxId!);
    for (const seat of sessionRuntime.listSeats()) {
      if (seat.kind === "agent" && seat.sandboxId) {
        registerSessionBridge(seat.seatId, seat.sandboxId, null);
      }
    }
    clearAllSessionBridges();
    clearWorkerDelegateGrants();
    sessionRuntime.close();
    invalidateHostSessionModuleCache();
    participantFilesById = {};
    participantIframes = [];
    participantIframeEls.clear();
    participantGenerations.clear();
    participantMountStarted.clear();
    syncMultiAgentSessionView();
    invalidateFunctionsModuleCache();
    if (opts?.offerSeatCleanup !== false) {
      await offerCleanupSessionSeats(seatSandboxIds);
    }
  }

  /** After session close: offer to delete non-working-set session_seat clones. */
  async function offerCleanupSessionSeats(
    sandboxIds: string[]
  ): Promise<void> {
    const unique = [...new Set(sandboxIds.filter(Boolean))];
    if (unique.length === 0) return;
    await refreshProjects();
    const targets: ProjectMeta[] = [];
    for (const id of unique) {
      if (id === activeAgentSandboxId) continue;
      let m = projects.find(p => p.id === id) ?? null;
      if (!m) {
        try {
          m = await readMeta(id);
        } catch {
          continue;
        }
      }
      if (m.cloneIntent !== "session_seat") continue;
      if (isInWorkingSet(m)) continue;
      targets.push(m);
    }
    if (targets.length === 0) return;
    const preview = targets
      .slice(0, 6)
      .map(p => p.name)
      .join("、");
    const ok = await askConfirm(
      `多人通道已關閉。是否刪除 ${targets.length} 個 session 分身（${preview}${targets.length > 6 ? "…" : ""}）？無法復原。`,
      {
        title: "清理 session 分身",
        confirmLabel: "刪除分身",
        tone: "danger",
        icon: "trash",
      }
    );
    if (!ok) return;
    busy = true;
    try {
      for (const p of targets) {
        await deleteProject(p.id);
        await clearMockKvStore(p.id);
        await clearMockDbStore(p.id);
        await clearCheckpointsForProject(p.id);
        await clearShellStateForDeletedProject(p.id);
      }
      invalidateFunctionsModuleCache();
      await refreshProjects();
      status = `已清理 ${targets.length} 個 session 分身`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      await refreshProjects();
    } finally {
      busy = false;
    }
  }

  async function resolveSessionHostFiles(
    hostSandboxId: string
  ): Promise<FileMap> {
    if (hostSandboxId === activeId) return files;
    if (hostSandboxId === activeAgentSandboxId) return agentFiles;
    return loadProjectFiles(hostSandboxId);
  }

  async function openMultiAgentSession(opts?: {
    chatSessionId?: string;
    /** Session Host SAM (總管 for coding-orch). Default = work sandbox. */
    hostSandboxId?: string;
    /** host_apply target. Default = work sandbox. */
    targetSandboxId?: string | null;
  }) {
    if (!activeId) {
      throw new HostBridgeError("no_target", "請先開啟工作沙盒");
    }
    const hostSandboxId = (opts?.hostSandboxId?.trim() || activeId).trim();
    if (multiAgentSession) {
      await closeMultiAgentSession();
    }
    const getHostFiles = () => resolveSessionHostFiles(hostSandboxId);
    const protocol = await fetchHostSessionMeta(hostSandboxId, getHostFiles);
    const targetSandboxId = (opts?.targetSandboxId?.trim() || activeId).trim();
    const opened = sessionRuntime.open(hostSandboxId, protocol, {
      targetSandboxId,
    });
    const chatSessionId = opts?.chatSessionId?.trim();
    try {
      await notifyHostSessionOpen(
        hostSandboxId,
        getHostFiles,
        opened.sessionId,
        opened.channelName,
        {
          ...(chatSessionId ? { chatSessionId } : {}),
          targetSandboxId,
        }
      );
    } catch {
      /* Host may omit /api/session/open */
    }
    try {
      sessionRuntime.joinHuman(
        protocol.roles.includes("human") ? "human" : protocol.roles[0]!
      );
    } catch {
      /* human role optional */
    }
    syncMultiAgentSessionView();
    status = `多人通道已開啟（${protocol.protocolId}）`;
    // Do not remount the work-canvas Host preview: schedulePreview would wipe
    // in-iframe UI state (e.g. gomoku「邀請對弈」flow). Domain open already
    // ran via notifyHostSessionOpen. Steward Host still rebuilds agent canvas.
    if (
      hostSandboxId === activeAgentSandboxId &&
      hostSandboxId !== activeId
    ) {
      void rebuildAgentPreview();
    }
    return {
      sessionId: opened.sessionId,
      channelName: opened.channelName,
      protocolId: protocol.protocolId,
      apiVersion: protocol.apiVersion,
      roles: [...protocol.roles],
      hostSandboxId,
      targetSandboxId,
    };
  }

  async function applyHostFileWrites(
    writes: { path: string; content: string }[],
    targetSandboxId?: string | null
  ) {
    const session = sessionRuntime.getSession();
    const targetId = (
      targetSandboxId?.trim() ||
      session?.targetSandboxId ||
      activeId ||
      ""
    ).trim();
    if (!targetId || writes.length === 0) return;
    const hostId = session?.hostSandboxId;

    if (targetId === activeId) {
      let next = { ...files };
      let reload = false;
      for (const w of writes) {
        next = { ...next, [w.path]: w.content };
        meta = await saveFile(activeId, w.path, w.content);
        if (openPath === w.path && isTextContent(next[w.path])) {
          const text = next[w.path];
          draft = typeof text === "string" ? text : draft;
        }
        if (writeShouldReloadCanvas(w.path)) reload = true;
      }
      files = next;
      if (reload) schedulePreview(true);
      if (activeId === activeAgentSandboxId) {
        agentFiles = files;
        if (reload) void rebuildAgentPreview();
      }
    } else if (targetId === activeAgentSandboxId) {
      let next = { ...agentFiles };
      let reload = false;
      for (const w of writes) {
        next = { ...next, [w.path]: w.content };
        await saveFile(targetId, w.path, w.content);
        if (writeShouldReloadCanvas(w.path)) reload = true;
      }
      agentFiles = next;
      if (reload) void rebuildAgentPreview();
    } else {
      for (const w of writes) {
        await saveFile(targetId, w.path, w.content);
      }
      if (participantFilesById[targetId]) {
        let next = { ...participantFilesById[targetId] };
        for (const w of writes) next = { ...next, [w.path]: w.content };
        participantFilesById = { ...participantFilesById, [targetId]: next };
      }
    }
    await refreshProjects();
    if (hostId) invalidateHostSessionModuleCache(hostId);
    if (targetId !== hostId) invalidateHostSessionModuleCache(targetId);
    status = `Host 已套用 ${writes.length} 個檔案變更`;
  }

  async function hostSessionDomainFetch(
    path: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    }
  ): Promise<unknown> {
    const session = sessionRuntime.getSession();
    const hostSandboxId =
      session?.hostSandboxId || activeAgentSandboxId || activeId;
    if (!hostSandboxId) {
      throw new HostBridgeError("no_target", "請先設總管或開啟工作沙盒");
    }
    const raw = String(path || "").trim();
    const normalized = raw.startsWith("/") ? raw : `/${raw}`;
    if (!normalized.includes("/api/session/")) {
      throw new HostBridgeError(
        "forbidden",
        "hostSessionFetch 僅允許 /api/session/*"
      );
    }
    let body: unknown;
    try {
      body = await fetchHostSessionDomain(
        hostSandboxId,
        () => resolveSessionHostFiles(hostSandboxId),
        normalized,
        {
          method: init?.method || "GET",
          headers: init?.headers,
          body: init?.body,
        }
      );
    } catch (e) {
      if (e instanceof SessionBridgeError) {
        throw new HostBridgeError(e.code, e.message);
      }
      throw e;
    }
    const result = body as {
      events?: unknown[];
      fileWrites?: { path?: string; content?: string }[];
      targetSandboxId?: string | null;
    };
    const events = Array.isArray(result?.events) ? result.events : [];
    if (events.length > 0 && sessionRuntime.getSession()) {
      // Grant before fan-out so workers see env.DELEGATE on task.assigned.
      await applyDelegateGrantsFromOrchEvents(
        events,
        typeof result?.targetSandboxId === "string"
          ? result.targetSandboxId
          : null
      );
      try {
        sessionRuntime.publishEvents(events);
      } catch {
        /* session may have closed */
      }
    }
    const writes = Array.isArray(result?.fileWrites)
      ? result.fileWrites
          .filter(
            w =>
              typeof w?.path === "string" &&
              w.path.trim() &&
              typeof w?.content === "string"
          )
          .map(w => ({ path: w.path!.trim(), content: w.content! }))
      : [];
    if (writes.length > 0) {
      await applyHostFileWrites(writes, result.targetSandboxId);
    }
    return body;
  }

  async function rebuildParticipantPreview(seatId: string, sandboxId: string) {
    const el = participantIframeEls.get(seatId);
    const seatFiles = participantFilesById[sandboxId];
    if (!el || !seatFiles) return;
    if (!(DEFAULT_ENTRY in seatFiles)) return;
    // Skip assertCanvasEntryServed probe for hidden seats: it races with iframe
    // navigation and is not needed once syncCanvasSnapshot has posted files.
    try {
      if (!canvasSwReady) {
        await ensureCanvasServiceWorker();
        canvasSwReady = true;
      }
      const generation = (participantGenerations.get(seatId) ?? 0) + 1;
      participantGenerations.set(seatId, generation);
      await syncCanvasSnapshot(sandboxId, generation, seatFiles);
      applyIframeColorScheme(el);
      el.src = buildCanvasEntryUrl(sandboxId, generation, DEFAULT_ENTRY);
    } catch (e) {
      console.error("[session seat]", seatId, e);
      status = e instanceof Error ? e.message : String(e);
    }
  }

  /**
   * DEC-037: issue／revoke worker env.DELEGATE grants from coding-orch events.
   */
  async function applyDelegateGrantsFromOrchEvents(
    events: unknown[],
    targetSandboxId: string | null
  ): Promise<void> {
    const hostId =
      (targetSandboxId && targetSandboxId.trim()) ||
      activeId ||
      sessionRuntime.getSession()?.hostSandboxId ||
      null;
    if (!hostId) return;
    let changed = false;
    for (const raw of events) {
      if (!raw || typeof raw !== "object") continue;
      const ev = raw as Record<string, unknown>;
      const type = String(ev.type || "");
      if (type === "task.assigned") {
        const seatId = String(ev.assigneeSeatId || "").trim();
        const taskId = String(ev.taskId || "").trim();
        const seat = sessionRuntime
          .listSeats()
          .find(s => s.seatId === seatId && s.kind === "agent");
        const workerId = seat?.sandboxId;
        if (!workerId || !taskId) continue;
        const input =
          ev.input && typeof ev.input === "object"
            ? (ev.input as Record<string, unknown>)
            : {};
        const pathHint = String(input.path || "")
          .trim()
          .replace(/^\/+/, "");
        const paths = pathHint ? [pathHint] : ["src"];
        try {
          setWorkerDelegateGrant({
            sandboxId: workerId,
            hostSandboxId: hostId,
            paths,
            mode: "readwrite",
            taskId,
            seatId: seatId || undefined,
            focusPath: pathHint || undefined,
          });
          changed = true;
        } catch (e) {
          console.warn("[delegate-grant] assign failed", e);
        }
      } else if (
        type === "task.result" ||
        type === "task.failed" ||
        type === "task.cancelled"
      ) {
        const taskId = String(ev.taskId || "").trim();
        if (taskId && clearDelegateGrantsForTask(taskId) > 0) changed = true;
      } else if (
        type === "orchestration.completed" ||
        type === "orchestration.failed" ||
        type === "orchestration.cancelled"
      ) {
        if (clearWorkerDelegateGrants() > 0) changed = true;
      }
    }
    if (changed) {
      invalidateFunctionsModuleCache();
    }
  }

  function createRemoteProjectionSessionBridge(opts: {
    runtime: SessionRuntime;
    seatId: string;
  }): SessionBridge {
    return {
      async apiVersion() {
        return SESSION_API_VERSION;
      },
      async capabilities() {
        return [...SESSION_CAPABILITIES];
      },
      async getSeat() {
        const session = opts.runtime.getSession();
        if (!session) {
          throw new SessionBridgeError("session_inactive", "目前沒有 session");
        }
        const seat = opts.runtime.getSeat(opts.seatId);
        if (!seat) {
          throw new SessionBridgeError("session_inactive", "座位已失效");
        }
        return {
          sessionId: session.sessionId,
          seatId: seat.seatId,
          role: seat.role,
          participantId: seat.sandboxId ?? seat.seatId,
          hostSandboxId: session.hostSandboxId,
          status: session.status,
        };
      },
      async getState() {
        throw new SessionBridgeError(
          "forbidden",
          "遠端座位狀態請在 homePeer 以事件為準"
        );
      },
      async getEventChannel() {
        const name = opts.runtime.getChannelName();
        if (!name) {
          throw new SessionBridgeError("session_inactive", "目前沒有 session");
        }
        return { name };
      },
      async act() {
        throw new SessionBridgeError(
          "forbidden",
          "遠端座位請在 homePeer 發言（act 經 Roster 隧道）"
        );
      },
      async leave() {
        throw new SessionBridgeError(
          "forbidden",
          "遠端座位請由主持場請離"
        );
      },
    };
  }

  async function joinMultiAgentSeat(opts: {
    sandboxId: string;
    role: string;
    protocolId: string;
    apiVersion: string;
    via?: "invite" | "apply";
    remote?: { peerAgentId: string; inviteId: string };
  }) {
    if (!multiAgentSession) {
      throw new HostBridgeError("session_inactive", "請先開啟多人通道");
    }
    const hostId = sessionRuntime.getSession()?.hostSandboxId;
    if (
      opts.sandboxId === hostId ||
      opts.sandboxId === activeId ||
      opts.sandboxId === activeAgentSandboxId
    ) {
      throw new HostBridgeError(
        "forbidden",
        "Host／工作沙盒／總管請以人類座位或 HOST 參與，勿再 join 為 Agent"
      );
    }
    let seat;
    try {
      seat = sessionRuntime.joinAgent({
        ...opts,
        via: opts.via === "invite" ? "invite" : "apply",
        ...(opts.remote ? { remote: opts.remote } : {}),
      });
    } catch (e) {
      if (e instanceof HostBridgeError) throw e;
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code: unknown }).code)
          : "protocol_mismatch";
      throw new HostBridgeError(
        code,
        e instanceof Error ? e.message : String(e)
      );
    }
    const pFiles = await loadProjectFiles(opts.sandboxId);
    participantFilesById = {
      ...participantFilesById,
      [opts.sandboxId]: pFiles,
    };
    await syncSessionSeatAgent(opts.sandboxId, pFiles);
    const bridge: SessionBridge = opts.remote
      ? createRemoteProjectionSessionBridge({
          runtime: sessionRuntime,
          seatId: seat.seatId,
        })
      : createShellSessionBridge({
          runtime: sessionRuntime,
          seatId: seat.seatId,
          sandboxId: opts.sandboxId,
          getHostFiles: () => {
            const hid = sessionRuntime.getSession()?.hostSandboxId;
            return hid
              ? resolveSessionHostFiles(hid)
              : Promise.resolve(files);
          },
          onLeaveSeat: id => leaveMultiAgentSeat(id),
          onHostFileWrites: (writes, targetSandboxId) =>
            applyHostFileWrites(writes, targetSandboxId),
        });
    registerSessionBridge(seat.seatId, opts.sandboxId, bridge);
    participantGenerations.set(seat.seatId, 0);
    participantIframes = [
      ...participantIframes,
      { seatId: seat.seatId, sandboxId: opts.sandboxId },
    ];
    syncMultiAgentSessionView();
    // Canvas load happens once from iframe {@attach} (must not mutate
    // participantIframes inside rebuild — that caused effect_update_depth_exceeded).
    status = opts.remote
      ? `化身已入座（遠端 proxy · ${opts.role}）`
      : `已入座 ${opts.role}（${opts.sandboxId.slice(0, 8)}…）`;
    return {
      seatId: seat.seatId,
      role: seat.role,
      sandboxId: opts.sandboxId,
    };
  }

  async function inviteRosterAvatarSeat(opts?: {
    role?: string;
    catalogId?: string;
    source?: string;
  }) {
    const invite = inviteRosterAvatarToSession({
      role: opts?.role,
      catalogId: opts?.catalogId,
      source: opts?.source,
    });
    status = `已邀請化身入座（${invite.protocol.protocolId}）`;
    return {
      inviteId: invite.inviteId,
      sessionId: invite.sessionId,
      role: invite.role,
      protocolId: invite.protocol.protocolId,
    };
  }

  async function onRosterInviteAccepted(ev: {
    peerAgentId: string;
    inviteId: string;
    sessionId: string;
    role: string;
  }): Promise<void> {
    const session = sessionRuntime.getSession();
    if (!session || session.sessionId !== ev.sessionId) {
      status = "收到化身接受，但通道已關閉或 session 不符";
      return;
    }
    let sandboxId = getRosterProjectionSandboxId(ev.peerAgentId);
    // Presence spawn can race accept; wait briefly for projection id.
    if (!sandboxId) {
      for (let i = 0; i < 20 && !sandboxId; i++) {
        await new Promise(r => setTimeout(r, 50));
        sandboxId = getRosterProjectionSandboxId(ev.peerAgentId);
      }
    }
    if (!sandboxId) {
      status = "找不到化身投影沙盒，無法入座";
      return;
    }
    try {
      const joined = await joinMultiAgentSeat({
        sandboxId,
        role: ev.role,
        protocolId: session.protocol.protocolId,
        apiVersion: session.protocol.apiVersion,
        via: "invite",
        remote: {
          peerAgentId: ev.peerAgentId,
          inviteId: ev.inviteId,
        },
      });
      const open = sessionRuntime.getSession();
      if (open) {
        sendSessionSeatBound(
          {
            kind: SESSION_SEAT_BOUND_KIND,
            inviteId: ev.inviteId,
            sessionId: open.sessionId,
            seatId: joined.seatId,
            role: joined.role,
            channelName: open.channelName,
          },
          ev.peerAgentId
        );
        status = `化身已入座；seat_bound 已送出（${joined.role}）`;
      }
    } catch (e) {
      status =
        e instanceof Error
          ? `化身入座失敗：${e.message}`
          : `化身入座失敗：${String(e)}`;
    }
  }

  async function onRosterRemoteAct(ev: {
    fromPeerId: string;
    act: SessionActPayload;
  }): Promise<void> {
    const { act, fromPeerId } = ev;
    const reply = (
      ok: boolean,
      result?: unknown,
      error?: { code: string; message: string }
    ) => {
      try {
        sendRosterRelayPayload(
          buildSessionActResultPayload({
            requestId: act.requestId,
            sessionId: act.sessionId,
            ok,
            result,
            error,
          }),
          fromPeerId
        );
      } catch {
        /* ignore */
      }
    };
    const session = sessionRuntime.getSession();
    if (!session || session.sessionId !== act.sessionId) {
      reply(false, undefined, {
        code: "session_inactive",
        message: "通道已關閉或 session 不符",
      });
      return;
    }
    const seat = sessionRuntime
      .listSeats()
      .find(
        s =>
          s.seatId === act.seatId &&
          s.remote?.inviteId === act.inviteId &&
          s.remote?.peerAgentId === fromPeerId
      );
    if (!seat?.sandboxId) {
      reply(false, undefined, {
        code: "not_found",
        message: "找不到遠端座位",
      });
      return;
    }
    try {
      const bridge = createShellSessionBridge({
        runtime: sessionRuntime,
        seatId: seat.seatId,
        sandboxId: seat.sandboxId,
        getHostFiles: () => {
          const hid = sessionRuntime.getSession()?.hostSandboxId;
          return hid
            ? resolveSessionHostFiles(hid)
            : Promise.resolve(files);
        },
        onLeaveSeat: id => leaveMultiAgentSeat(id),
        onHostFileWrites: (writes, targetSandboxId) =>
          applyHostFileWrites(writes, targetSandboxId),
      });
      const result = await bridge.act(act.payload);
      reply(true, result);
    } catch (e) {
      const code =
        e instanceof SessionBridgeError
          ? e.code
          : e instanceof HostBridgeError
            ? e.code
            : "act_rejected";
      reply(false, undefined, {
        code,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function onRosterHomeSeatReady(ev: {
    sandboxId: string;
    seatId: string;
    sessionId: string;
    inviteId: string;
  }): Promise<void> {
    try {
      await openProject(ev.sandboxId);
      status = `遠端座位橋已就緒（可發言）`;
    } catch (e) {
      status =
        e instanceof Error
          ? `開啟遠端座位失敗：${e.message}`
          : `開啟遠端座位失敗：${String(e)}`;
    }
  }

  async function leaveMultiAgentSeat(seatId: string) {
    const seat = sessionRuntime.getSeat(seatId);
    if (seat?.sandboxId) {
      await stopSessionSeatAgent(seat.sandboxId);
      registerSessionBridge(seat.seatId, seat.sandboxId, null);
      if (clearDelegateGrant(seat.sandboxId)) {
        invalidateFunctionsModuleCache();
      }
      const next = { ...participantFilesById };
      delete next[seat.sandboxId];
      participantFilesById = next;
    }
    sessionRuntime.leaveSeat(seatId);
    participantIframes = participantIframes.filter(p => p.seatId !== seatId);
    participantIframeEls.delete(seatId);
    participantGenerations.delete(seatId);
    participantMountStarted.delete(seatId);
    syncMultiAgentSessionView();
    invalidateFunctionsModuleCache();
  }

  async function spawnMultiAgentParticipant(opts: {
    role?: string;
    name?: string;
    sourceSandboxId?: string;
  }) {
    if (!multiAgentSession) {
      throw new HostBridgeError("session_inactive", "請先開啟多人通道");
    }
    const isCodingOrch =
      multiAgentSession.protocol.protocolId === CODING_ORCH_PROTOCOL_ID;
    const role =
      opts.role?.trim() ||
      (isCodingOrch
        ? CODING_ORCH_WORKER_DEFAULT_ROLE
        : SESSION_PARTICIPANT_DEFAULT_ROLE);
    let sandboxId = opts.sourceSandboxId?.trim() || "";
    let name = opts.name?.trim() || "";
    if (sandboxId) {
      const cloned = await cloneProject(sandboxId, name || undefined, {
        agentManaged: true,
        inWorkingSet: false,
        cloneIntent: "session_seat",
      });
      sandboxId = cloned.id;
      name = cloned.name;
      await refreshProjects();
    } else if (isCodingOrch) {
      let starterFiles: FileMap;
      let starterName = name || "Coding Agent";
      let source = "playgrounds-coding-orch-spawn-pg-llm-agent";
      try {
        starterFiles = await fetchGithubProject({
          owner: "sampot",
          repo: "pg-llm-agent",
        });
        starterName = name || "Coding Agent";
      } catch {
        // Offline／rate limit：退回狗糧 starter（非產品規格）
        starterFiles = createCodingOrchestrationWorkerStarterFiles();
        starterName = name || CODING_ORCH_WORKER_STARTER_NAME;
        source = "playgrounds-coding-orch-spawn-worker";
      }
      const created = await createProject(starterName, starterFiles, {
        source,
        agentManaged: true,
        inWorkingSet: false,
        cloneIntent: "session_seat",
      });
      sandboxId = created.id;
      name = created.name;
      await ensureAgentController(sandboxId, starterFiles, name);
      await refreshProjects();
    } else {
      const created = await createProject(
        name || SESSION_PARTICIPANT_STARTER_NAME,
        createSessionParticipantStarterFiles(),
        {
          source: "playgrounds-session-spawn-participant",
          agentManaged: true,
          inWorkingSet: false,
          cloneIntent: "session_seat",
        }
      );
      sandboxId = created.id;
      name = created.name;
      await refreshProjects();
    }
    const seat = await joinMultiAgentSeat({
      sandboxId,
      role,
      protocolId: multiAgentSession.protocol.protocolId,
      apiVersion: multiAgentSession.protocol.apiVersion,
      via: "invite",
    });
    return {
      sandboxId,
      seatId: seat.seatId,
      role: seat.role,
      name,
    };
  }

  function toolCandidateProjects(): ProjectMeta[] {
    return projects.filter(
      p => p.id !== activeId && p.id !== activeAgentSandboxId
    );
  }

  function rankedToolCandidates(forPath: string): RankedTool[] {
    void toolPrefsTick;
    return rankToolsForPath(
      toolCandidateProjects(),
      forPath.trim(),
      readToolPrefs()
    );
  }

  const editorToolHint = $derived.by(() => {
    void toolPrefsTick;
    if (!activeId || !openPath || activeToolSession) return null;
    return pickBestTool(
      toolCandidateProjects(),
      openPath,
      readToolPrefs()
    );
  });

  function syncOpenToolSelectionFromPath(): void {
    const ranked = rankedToolCandidates(openToolPath);
    const best = pickBestTool(
      toolCandidateProjects(),
      openToolPath.trim(),
      readToolPrefs()
    );
    if (best) {
      openToolSandboxId = best.meta.id;
      return;
    }
    if (
      ranked.length &&
      !ranked.some(r => r.meta.id === openToolSandboxId)
    ) {
      openToolSandboxId = ranked[0]!.meta.id;
    }
  }

  function closeOpenToolDialog() {
    openToolDialogOpen = false;
    try {
      openToolDialogEl?.close();
    } catch {
      /* ignore */
    }
  }

  function openOpenToolDialog() {
    if (!activeId) {
      error = "請先開啟工作沙盒";
      return;
    }
    const path = openPath ?? "";
    const ranked = rankedToolCandidates(path);
    if (ranked.length === 0) {
      error =
        "沒有可掛載的工具沙盒。請先「新沙盒」用工具範本建立，或匯入一個工具沙盒。";
      return;
    }
    const best = pickBestTool(
      toolCandidateProjects(),
      path,
      readToolPrefs()
    );
    openToolSandboxId = best?.meta.id ?? ranked[0]!.meta.id;
    openToolPath = path || openPath || "";
    openToolMode = "readwrite";
    openToolDialogOpen = true;
    error = null;
    queueMicrotask(() => openToolDialogEl?.showModal());
  }

  function openOpenToolDialogAsTool() {
    openMainAsTool = true;
    openOpenToolDialog();
  }

  /** One-click: best matching tool for the current file; else open picker. */
  async function handleEditorToolButton() {
    if (activeCanvasTab) {
      await selectMainContentTab(EDITOR_TAB_ID);
      return;
    }
    if (!activeId) {
      error = "請先開啟工作沙盒";
      return;
    }
    if (!openPath) {
      openOpenToolDialogAsTool();
      return;
    }
    const best = pickBestTool(
      toolCandidateProjects(),
      openPath,
      readToolPrefs()
    );
    if (best) {
      await mountToolWithPath(best.meta.id, openPath, "readwrite");
      return;
    }
    openOpenToolDialog();
  }

  async function mountToolWithPath(
    toolSandboxId: string,
    path: string,
    mode: ToolGrantMode
  ) {
    const grantPath = path.trim();
    if (!grantPath) {
      error = "請指定要授權的檔案或目錄路徑";
      return;
    }
    if (
      openPath &&
      !isBindingsVirtualPath(openPath) &&
      pathMatchesGrant(openPath, [grantPath]) &&
      saveState === "dirty"
    ) {
      const ok = await askConfirm(
        `「${openPath}」尚有未儲存變更。儲存後再開啟工具？`,
        {
          title: "未儲存變更",
          confirmLabel: "儲存並開啟",
          icon: "alertTriangle",
        }
      );
      if (!ok) return;
      await flushSave();
    }
    busy = true;
    error = null;
    try {
      await openToolSession({
        toolSandboxId,
        paths: [grantPath],
        mode,
        focusPath: grantPath,
      });
      rememberToolForPath(toolSandboxId, grantPath);
      toolPrefsTick += 1;
      closeOpenToolDialog();
    } catch (e) {
      error =
        e instanceof ToolGrantError || e instanceof Error
          ? e.message
          : String(e);
    } finally {
      busy = false;
    }
  }

  async function confirmOpenToolDialog() {
    if (!activeId || !openToolSandboxId) return;
    if (!openMainAsTool) {
      busy = true;
      error = null;
      try {
        await openMainCanvasSession({ sandboxId: openToolSandboxId });
        closeOpenToolDialog();
      } catch (e) {
        error =
          e instanceof MainTabsError || e instanceof Error
            ? e.message
            : String(e);
      } finally {
        busy = false;
      }
      return;
    }
    await mountToolWithPath(
      openToolSandboxId,
      openToolPath,
      openToolMode
    );
  }

  function openOpenMainCanvasDialog() {
    openMainAsTool = false;
    openOpenToolDialog();
  }

  /** Align project CSS `prefers-color-scheme` with the blog `data-theme`. */
  function syncPreviewColorScheme() {
    applyIframeColorScheme(iframeEl);
  }

  function syncAgentColorScheme() {
    applyIframeColorScheme(agentIframeEl);
  }

  function syncParticipantColorSchemes() {
    for (const el of participantIframeEls.values()) {
      applyIframeColorScheme(el);
    }
  }

  function syncAllIframeColorSchemes() {
    syncPreviewColorScheme();
    syncAgentColorScheme();
    syncParticipantColorSchemes();
  }

  function schedulePreview(immediate: boolean) {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(
      () => {
        void rebuildPreview();
      },
      immediate ? 0 : 280
    );
  }

  async function rebuildPreview() {
    if (!meta || !iframeEl) return;
    if (!(DEFAULT_ENTRY in files)) {
      clearPreview();
      previewError = `找不到畫布入口：${DEFAULT_ENTRY}（請放在沙盒根目錄）`;
      return;
    }
    try {
      if (!canvasSwReady) {
        await ensureCanvasServiceWorker();
        canvasSwReady = true;
      }
      canvasGeneration += 1;
      const generation = canvasGeneration;
      await syncCanvasSnapshot(meta.id, generation, files);
      await assertCanvasEntryServed(meta.id, generation, DEFAULT_ENTRY);
      previewError = null;
      syncPreviewColorScheme();
      iframeEl.removeAttribute("srcdoc");
      iframeEl.src = buildCanvasEntryUrl(meta.id, generation, DEFAULT_ENTRY);
      armCanvasConsoleGate(iframeEl, shellPrefs.mirrorConsoleToBrowser);
    } catch (e) {
      clearPreview();
      previewError = e instanceof Error ? e.message : String(e);
    }
  }

  async function rebuildAgentPreview() {
    // While Files tab is showing, keep the warm iframe; mark stale if it was mounted.
    if (sidebarTab !== "agent") {
      if (agentCanvasIsLive()) agentCanvasStale = true;
      return;
    }
    if (!activeAgentSandboxId || !agentIframeEl) return;
    if (!(DEFAULT_ENTRY in agentFiles)) {
      clearAgentPreview();
      agentPreviewError = `總管缺少 ${DEFAULT_ENTRY}`;
      agentCanvasStale = false;
      return;
    }
    try {
      if (!canvasSwReady) {
        await ensureCanvasServiceWorker();
        canvasSwReady = true;
      }
      agentCanvasGeneration += 1;
      const generation = agentCanvasGeneration;
      await syncCanvasSnapshot(
        activeAgentSandboxId,
        generation,
        agentFiles
      );
      await assertCanvasEntryServed(
        activeAgentSandboxId,
        generation,
        DEFAULT_ENTRY
      );
      agentPreviewError = null;
      agentCanvasStale = false;
      syncAgentColorScheme();
      agentIframeEl.removeAttribute("srcdoc");
      agentIframeEl.src = buildCanvasEntryUrl(
        activeAgentSandboxId,
        generation,
        DEFAULT_ENTRY
      );
      armCanvasConsoleGate(agentIframeEl, shellPrefs.mirrorConsoleToBrowser);
      // Re-announce work project after Agent canvas reload (iframe is fresh).
      const workId = activeId;
      if (workId) {
        agentIframeEl.addEventListener(
          "load",
          () => notifyAgentWorkProject(workId),
          { once: true }
        );
      }
    } catch (e) {
      clearAgentPreview();
      agentPreviewError = e instanceof Error ? e.message : String(e);
      agentCanvasStale = false;
    }
  }

  async function applyActiveAgent(
    id: string | null,
    opts?: { deferReload?: boolean; reveal?: boolean; mountUi?: boolean }
  ) {
    const reveal = opts?.reveal !== false;
    /** When false, only designate + Controller (DEC-024); skip Agent canvas iframe. */
    const mountUi = opts?.mountUi !== false;
    activeAgentSandboxId = id;
    writeActiveAgentSandboxId(id);
    invalidateFunctionsModuleCache();
    if (!id) {
      agentMeta = null;
      agentFiles = {};
      agentPreviewError = null;
      agentUiMountedId = null;
      agentCanvasStale = false;
      await stopAgentController();
      if (opts?.deferReload) {
        setTimeout(() => clearAgentPreview(), 0);
      } else {
        clearAgentPreview();
      }
      return;
    }
    try {
      agentMeta = await readMeta(id);
      if (activeId === id) {
        agentFiles = files;
      } else {
        agentFiles = await loadProjectFiles(id);
      }
      await syncAgentController(id, agentFiles);
      // Intentional set/create: show Agent tab. Boot restore / ensure: keep current tab.
      if (reveal) {
        revealAgentPanel();
      }
      status = `總管：${agentMeta.name}（Controller）`;
      if (!mountUi) {
        agentUiMountedId = null;
        clearAgentPreview();
        return;
      }
      agentUiMountedId = id;
      const reload = async () => {
        await tick();
        await rebuildAgentPreview();
      };
      if (opts?.deferReload) {
        setTimeout(() => {
          void reload();
        }, 0);
      } else {
        await reload();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      agentPreviewError = msg;
      error = msg;
      agentMeta = null;
      agentFiles = {};
      agentUiMountedId = null;
      agentCanvasStale = false;
      activeAgentSandboxId = null;
      writeActiveAgentSandboxId(null);
      await stopAgentController();
    }
  }

  async function clearShellStateForDeletedProject(targetId: string) {
    if (activeAgentSandboxId === targetId) {
      await applyActiveAgent(null);
    }
    await stopAgentRuntime(targetId);
    if (
      listCanvasTabs(mainTabs).some(
        t =>
          t.sandboxId === targetId || t.grant?.hostSandboxId === targetId
      )
    ) {
      await clearAllMainCanvasTabs();
    }
    if (targetProjectOverride === targetId) {
      targetProjectOverride = null;
    }
    if (activeId === targetId) {
      activeId = null;
      writeActiveWorkSandboxId(null);
      meta = null;
      files = {};
      dirs = [];
      selectedDir = null;
      openPath = null;
      draft = "";
      clearPreview();
    }
  }

  /**
   * After switching steward: offer to delete the previous agentManaged instance.
   */
  async function offerRetirePreviousSteward(
    previousId: string | null,
    newId: string | null
  ): Promise<void> {
    if (!previousId || !newId || previousId === newId) return;
    let prevMeta: ProjectMeta;
    try {
      prevMeta = await readMeta(previousId);
    } catch {
      return;
    }
    if (!isAgentManagedProject(prevMeta)) return;
    const ok = await askConfirm(
      `已改設總管。是否刪除舊總管實例「${prevMeta.name}」？無法復原。`,
      {
        title: "退役舊總管",
        confirmLabel: "刪除舊實例",
        tone: "danger",
        icon: "trash",
      }
    );
    if (!ok) return;
    busy = true;
    try {
      await deleteProject(previousId);
      await clearMockKvStore(previousId);
      await clearMockDbStore(previousId);
      await clearCheckpointsForProject(previousId);
      await clearShellStateForDeletedProject(previousId);
      invalidateFunctionsModuleCache();
      await refreshProjects();
      status = `已刪除舊總管「${prevMeta.name}」`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      await refreshProjects();
    } finally {
      busy = false;
    }
  }

  async function handleSetActiveAgent(id?: string) {
    const targetId = typeof id === "string" && id ? id : activeId;
    if (!targetId) return;
    const previousId = activeAgentSandboxId;
    busy = true;
    error = null;
    try {
      await applyActiveAgent(targetId);
      closeProjectDialog();
      actionsMenuOpen = false;
      projectPickerOpen = false;
      busy = false;
      await offerRetirePreviousSteward(previousId, targetId);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function handleClearActiveAgent() {
    busy = true;
    try {
      await applyActiveAgent(null);
      status = "已清除總管";
    } finally {
      busy = false;
    }
  }

  async function handleCloneProject(id?: string) {
    const sourceId = typeof id === "string" && id ? id : activeId;
    if (!sourceId) return;
    const stateSel = await askStateMove(
      "複製沙盒",
      "預設只複製原始碼。可另選要一併複製的執行期狀態（新沙盒 id；不影響來源）。",
      { confirmLabel: "複製", icon: "copy" }
    );
    if (stateSel === null) return;
    busy = true;
    error = null;
    try {
      const created = await cloneProject(sourceId, undefined, {
        inWorkingSet: true,
        cloneIntent: "user",
      });
      const applied = await copyProjectState(sourceId, created.id, stateSel);
      await refreshProjects();
      await openProject(created.id);
      status = anyStateSelected(applied)
        ? `已複製為「${created.name}」（含 ${summarizeStateParts(applied)}）`
        : `已複製為「${created.name}」`;
      closeProjectDialog();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function handleAddFile() {
    if (!activeId) return;
    const base = contextDir();
    const initial = base ? joinProjectPath(base, "script.js") : "script.js";
    const next = await askPrompt("新增檔案", initial, "沙盒內相對路徑");
    if (next === null) return;
    const path = next.trim();
    if (!path) return;
    if (!isValidProjectPath(path)) {
      error = "檔案路徑無效";
      return;
    }
    if (path in files) {
      error = "檔案已存在";
      return;
    }
    if (dirs.includes(path)) {
      error = "已有同名目錄";
      return;
    }
    busy = true;
    error = null;
    try {
      files = { ...files, [path]: "" };
      meta = await saveFile(activeId, path, "");
      await refreshDirs();
      selectExplorerFile(path);
      status = `新增 ${path}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function handleAddDir() {
    if (!activeId) return;
    const base = contextDir();
    const initial = base ? joinProjectPath(base, "folder") : "folder";
    const next = await askPrompt("新增資料夾", initial, "沙盒內相對路徑");
    if (next === null) return;
    const path = next.trim();
    if (!path) return;
    if (!isValidDirPath(path)) {
      error = "目錄路徑無效";
      return;
    }
    if (path in files) {
      error = "已有同名檔案";
      return;
    }
    busy = true;
    error = null;
    try {
      meta = await createDir(activeId, path);
      await refreshDirs();
      selectExplorerDir(path);
      status = `新增資料夾 ${path}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function handleDeleteSelection() {
    if (!activeId) return;
    if (selectedDir) {
      const path = selectedDir;
      const ok = await askConfirm(
        `刪除資料夾「${path}」及其內容？無法復原。`,
        { title: "刪除資料夾", confirmLabel: "刪除", tone: "danger", icon: "trash" }
      );
      if (!ok) return;
      busy = true;
      try {
        meta = await deleteDir(activeId, path);
        files = await loadProjectFiles(activeId);
        await refreshDirs();
        if (openPath && !(openPath in files)) {
          openPath = Object.keys(files)[0] ?? null;
          draft = openPath ? draftFromContent(files[openPath]) : "";
        }
        selectedDir = null;
        schedulePreview(true);
        status = `已刪除資料夾 ${path}`;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      } finally {
        busy = false;
      }
      return;
    }
    if (!openPath) return;
    const ok = await askConfirm(`刪除檔案「${openPath}」？`, {
      title: "刪除檔案",
      confirmLabel: "刪除",
      tone: "danger",
      icon: "trash",
    });
    if (!ok) return;
    busy = true;
    try {
      meta = await deleteFile(activeId, openPath);
      const next = { ...files };
      delete next[openPath];
      files = next;
      await refreshDirs();
      openPath = Object.keys(files)[0] ?? null;
      draft = openPath ? draftFromContent(files[openPath]) : "";
      schedulePreview(true);
      status = "已刪除檔案";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function handleRenameSelection() {
    if (!activeId) return;
    if (selectedDir) {
      const from = selectedDir;
      const next = await askPrompt("重新命名資料夾", from, "新路徑");
      if (next === null) return;
      const trimmed = next.trim();
      if (!trimmed || trimmed === from) return;
      if (!isValidDirPath(trimmed)) {
        error = "新路徑無效";
        return;
      }
      busy = true;
      try {
        meta = await renameDir(activeId, from, trimmed);
        files = await loadProjectFiles(activeId);
        await refreshDirs();
        if (openPath && (openPath === from || openPath.startsWith(`${from}/`))) {
          openPath = rewritePathPrefix(openPath, from, trimmed);
          draft = draftFromContent(files[openPath]);
        }
        selectedDir = trimmed;
        expandAncestors(trimmed);
        schedulePreview(true);
        status = `重新命名資料夾 → ${trimmed}`;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      } finally {
        busy = false;
      }
      return;
    }
    if (!openPath) return;
    const next = await askPrompt("重新命名檔案", openPath, "新路徑");
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === openPath) return;
    if (!isValidProjectPath(trimmed)) {
      error = "新路徑無效";
      return;
    }
    busy = true;
    try {
      meta = await renameFile(activeId, openPath, trimmed);
      const content = files[openPath] ?? "";
      const copy = { ...files };
      delete copy[openPath];
      copy[trimmed] = content;
      files = copy;
      await refreshDirs();
      openPath = trimmed;
      draft = draftFromContent(content);
      expandAncestors(trimmed);
      schedulePreview(true);
      status = `重新命名 → ${trimmed}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  function triggerUpload() {
    uploadInputEl?.click();
  }

  function triggerUploadDir() {
    uploadDirInputEl?.click();
  }

  async function handleUploadOs(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    // Copy before clearing: input.files is a live FileList; value="" empties it.
    const list = Array.from(input.files ?? []);
    input.value = "";
    if (!activeId || list.length === 0) return;
    busy = true;
    error = null;
    try {
      await flushSave();
      const dest = contextDir();
      const patch = await browserFilesToFileMap(list, dest);
      const overlap = Object.keys(patch).filter(p => p in files);
      if (overlap.length > 0) {
        const ok = await askConfirm(
          `將覆蓋 ${overlap.length} 個既有檔案，繼續？`,
          { title: "上傳確認", confirmLabel: "覆蓋", icon: "upload" }
        );
        if (!ok) return;
      }
      meta = await writeFiles(activeId, patch);
      files = { ...files, ...patch };
      await refreshDirs();
      const first = sortProjectPaths(Object.keys(patch))[0];
      if (first) selectExplorerFile(first);
      schedulePreview(true);
      status = `已上傳 ${Object.keys(patch).length} 個檔案`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function handleDownloadSelection() {
    if (!activeId) return;
    await flushSave();
    try {
      if (selectedDir) {
        const paths = filesUnderDir(Object.keys(files), selectedDir);
        if (paths.length === 0) {
          error = "此資料夾沒有可下載的檔案";
          return;
        }
        const zip = pathsToZip(files, paths, {
          folderName: basename(selectedDir),
        });
        downloadBlob(`${basename(selectedDir)}.zip`, zip);
        status = `已下載 ${selectedDir}/（ZIP）`;
        return;
      }
      if (!openPath) {
        error = "請先選擇檔案或資料夾";
        return;
      }
      const content = files[openPath];
      if (content === undefined) {
        error = "找不到檔案內容";
        return;
      }
      downloadBytes(basename(openPath), fileContentToBytes(content));
      status = `已下載 ${openPath}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function handleFetchUrl() {
    if (!activeId) return;
    const url = await askPrompt(
      "從 URL 下載",
      "https://",
      "需對方開放 CORS；下載後寫入目前沙盒"
    );
    if (url === null || !url.trim()) return;
    const suggested = joinProjectPath(
      contextDir(),
      filenameFromUrl(url.trim())
    );
    const dest = await askPrompt(
      "儲存路徑",
      suggested,
      "沙盒內相對路徑（可含目錄）"
    );
    if (dest === null || !dest.trim()) return;
    if (!isValidProjectPath(dest.trim())) {
      error = "目標路徑無效";
      return;
    }
    if (dest.trim() in files) {
      const ok = await askConfirm(`「${dest.trim()}」已存在，要覆蓋嗎？`, {
        title: "覆蓋確認",
        confirmLabel: "覆蓋",
        icon: "alertTriangle",
      });
      if (!ok) return;
    }
    busy = true;
    error = null;
    try {
      const result = await fetchUrlToFile(url.trim(), {
        destPath: dest.trim(),
      });
      meta = await saveFile(activeId, result.path, result.content);
      files = { ...files, [result.path]: result.content };
      await refreshDirs();
      selectExplorerFile(result.path);
      schedulePreview(true);
      status = `已下載 → ${result.path}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function handleRenameProject() {
    if (!activeId || !meta) return;
    const next = await askPrompt("重新命名沙盒", meta.name, "沙盒名稱");
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === meta.name) return;
    meta = await updateProjectMeta(activeId, { name: trimmed });
    await refreshProjects();
    status = "已更新沙盒名稱";
  }

  async function handleExport() {
    if (!activeId || !meta) return;
    const stateSel = await askStateMove(
      "匯出沙盒",
      "預設只打包原始碼。可另選要一併寫入沙盒包裹的執行期狀態（KV／DB；密鑰庫永不進包裹）。",
      { confirmLabel: "匯出", icon: "download" }
    );
    if (stateSel === null) return;
    await flushSave();
    const state = anyStateSelected(stateSel)
      ? await collectProjectState(activeId, stateSel)
      : null;
    const zip = filesToZip(files, meta, { state });
    downloadBlob(withSamExtension(meta.name), zip);
    status = anyStateSelected(stateSel)
      ? `已匯出沙盒（含 ${summarizeStateParts(stateSel)}）`
      : "已匯出沙盒";
  }

  async function handleImportDirectoryAsProject(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const list = Array.from(input.files ?? []);
    input.value = "";
    if (list.length === 0) return;
    busy = true;
    error = null;
    status = "正在從本機目錄建立沙盒…";
    try {
      const folderName = browserDirectoryRootName(list);
      const name =
        newProjectName.trim() ||
        folderName ||
        `本機目錄 ${projects.length + 1}`;
      const fileMap = await browserFilesToFileMap(list, "");
      const created = await createProject(name, fileMap, {
        source: folderName ? `local-dir:${folderName}` : "local-dir",
        inWorkingSet: true,
      });
      newProjectName = "";
      await refreshProjects();
      await openProject(created.id);
      status = `已從本機目錄建立沙盒（${Object.keys(fileMap).length} 個檔案）`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      status = "從本機目錄建立失敗";
    } finally {
      busy = false;
    }
  }

  async function handleImport(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!isSamFilename(file.name)) {
      error = "請選擇 .sam 沙盒包裹";
      return;
    }
    busy = true;
    error = null;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const imported = zipToFiles(buf);
      let stateSel: ProjectStateParts = { ...PROJECT_STATE_NONE };
      if (imported.state) {
        busy = false;
        const initial: ProjectStateParts = {
          kv: Boolean(imported.state.kv && imported.state.kv.size > 0),
          db: Boolean(
            (imported.state.db ?? imported.state.d1) &&
              (imported.state.db ?? imported.state.d1)!.byteLength > 0
          ),
          secrets: false,
        };
        const chosen = await askStateMove(
          "匯入沙盒狀態",
          "此沙盒包裹含執行期狀態。請選擇要還原的項目（可全部取消勾選，只匯入原始碼）。",
          { confirmLabel: "匯入", icon: "download", initial }
        );
        if (chosen === null) return;
        stateSel = chosen;
        busy = true;
      }
      const name = newProjectName.trim() || imported.meta.name;
      const created = await createProject(name, imported.files, {
        entry: imported.meta.entry,
        source: imported.meta.source,
        inWorkingSet: true,
      });
      const applied = await applyProjectState(
        created.id,
        imported.state,
        stateSel
      );
      newProjectName = "";
      await refreshProjects();
      await openProject(created.id);
      status = anyStateSelected(applied)
        ? `已匯入沙盒（含 ${summarizeStateParts(applied)}）`
        : "已匯入沙盒";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function handleCloneGithub() {
    const parsed = parseGithubUrl(githubUrl);
    if (!parsed) {
      error = "無法解析 GitHub URL（完整網址或 owner/repo）";
      return;
    }
    const intent: OpenIntent = {
      kind: "github",
      input: githubUrl.trim(),
      ref: parsed,
      options: { ...DEFAULT_OPEN_OPTIONS },
    };
    let replaceSandboxId: string | null = null;
    const existingId = findSandboxIdByOpenSource(projects, intent);
    if (existingId) {
      const existing = projects.find(p => p.id === existingId);
      const choice = await askInstallConflict({
        existingName: existing?.name ?? existingId,
        sourceLabel: existing?.source || formatGithubSource(parsed),
      });
      if (choice === null) {
        status = "已取消安裝";
        return;
      }
      if (choice === "replace") replaceSandboxId = existingId;
    }
    busy = true;
    openingFromUrl = true;
    openTransferProgress = { ratio: null };
    error = null;
    status = "自 GitHub 複製中…";
    try {
      const remoteFiles = await fetchGithubProject(parsed, {
        onProgress: p => {
          openTransferProgress = fileListToOpenProgress(p);
        },
      });
      openTransferProgress = { ratio: 1, detail: "完成" };
      status = "正在寫入本機 OPFS…";
      const name = parsed.path
        ? parsed.path.split("/").pop() || parsed.repo
        : parsed.repo;
      if (replaceSandboxId) {
        status = "正在清空既有沙盒…";
        await deleteInstalledSandboxFully(replaceSandboxId);
        status = "正在重新安裝…";
      }
      const created = await createProject(name, remoteFiles, {
        ...(replaceSandboxId ? { id: replaceSandboxId } : {}),
        source: formatGithubSource(parsed),
        inWorkingSet: true,
      });
      await refreshProjects();
      await openProject(created.id);
      githubUrl = "";
      status = replaceSandboxId
        ? "已清空並重新安裝本機沙盒；可用選單複製開啟連結分享"
        : "已複製至 OPFS；可用選單複製開啟連結分享";
    } catch (e) {
      error = explainOpenFromUrlError(e, "github");
      status = "複製失敗";
    } finally {
      busy = false;
      openingFromUrl = false;
      openTransferProgress = null;
    }
  }

  function hostGrantPathsForTool(): string[] {
    const tops = new Set<string>();
    for (const p of Object.keys(files)) {
      const top = p.split("/")[0];
      if (top) tops.add(top);
    }
    for (const d of dirs) {
      const top = d.split("/")[0];
      if (top) tops.add(top);
    }
    if (tops.size === 0) tops.add(DEFAULT_ENTRY);
    return [...tops];
  }

  /** After import/reuse: open as work, set Agent, or mount as Tool. */
  async function applyOpenFromUrlRole(
    sandboxId: string,
    role: "work" | "tool" | "agent",
    reused: boolean
  ): Promise<void> {
    const reusedNote = reused ? "（已有相同來源，直接開啟）" : "";

    if (role === "work") {
      await openProject(sandboxId);
      status = `已從網址開啟沙盒${reusedNote}；可用選單複製開啟連結分享`;
      return;
    }

    if (role === "agent") {
      await openProject(sandboxId);
      const agentFileMap =
        activeId === sandboxId ? files : await loadProjectFiles(sandboxId);
      if (!agentFilesHaveController(agentFileMap)) {
        error =
          "此沙盒沒有 controller.js，無法設為總管；已開啟為工作沙盒。";
        status = `已從網址開啟沙盒${reusedNote}`;
        return;
      }
      await applyActiveAgent(sandboxId, { reveal: true });
      status = `已從網址開啟並設為總管${reusedNote}`;
      return;
    }

    // as=tool: need a separate host work project
    let hostId =
      activeId && activeId !== sandboxId ? activeId : null;
    if (!hostId) {
      const other = projects.find(p => p.id !== sandboxId);
      if (other) {
        await openProject(other.id);
        hostId = other.id;
      } else {
        const blank = await createProject("工作沙盒", createStarterFiles(), {
          inWorkingSet: true,
        });
        await refreshProjects();
        await openProject(blank.id);
        hostId = blank.id;
      }
    }
    await maybeReconcileAndAdmitCapabilities(sandboxId);
    await openToolSession({
      toolSandboxId: sandboxId,
      paths: hostGrantPathsForTool(),
      mode: "readwrite",
    });
    status = `已從網址開啟並掛為工具${reusedNote}（工作沙盒：${meta?.name ?? hostId}）`;
  }

  /** DEC-025: import from `?open=` (`.sam` / GitHub / GitLab). Returns true if handled. */
  async function runOpenFromUrl(intent: OpenIntent): Promise<boolean> {
    if (intent.kind === "invalid") {
      error = intent.reason;
      return false;
    }

    const { options } = intent;
    let replaceSandboxId: string | null = null;

    if (!options.fresh) {
      const existingId = findSandboxIdByOpenSource(projects, intent);
      if (existingId) {
        const existing = projects.find(p => p.id === existingId);
        const choice = await askInstallConflict({
          existingName: existing?.name ?? existingId,
          sourceLabel:
            existing?.source || sourceLabelFromOpenIntent(intent) || undefined,
        });
        if (choice === null) {
          status = "已取消安裝";
          return false;
        }
        if (choice === "replace") replaceSandboxId = existingId;
        // keep → fall through and create a new sandbox id
      }
    }

    busy = true;
    openingFromUrl = true;
    openTransferProgress = { ratio: null };
    error = null;

    try {
      status =
        intent.kind === "sam"
          ? "正在從網址下載沙盒包裹…"
          : intent.kind === "gitlab"
            ? "正在從網址讀取 GitLab 公開儲存庫…"
            : "正在從網址讀取 GitHub 公開儲存庫…";

      let sandboxId: string;
      let statusExtra = "";

      if (intent.kind === "sam") {
        const packed = await fetchSamPackageBytes(intent.url, {
          onProgress: p => {
            openTransferProgress = byteToOpenProgress(p);
          },
        });
        openTransferProgress = { ratio: 1, detail: "100%" };
        status = "正在匯入沙盒包裹…";
        const imported = zipToFiles(packed.bytes);
        let stateSel: ProjectStateParts = { ...PROJECT_STATE_NONE };
        if (imported.state && options.state === "ask") {
          busy = false;
          openingFromUrl = false;
          openTransferProgress = null;
          const initial: ProjectStateParts = {
            kv: Boolean(imported.state.kv && imported.state.kv.size > 0),
            db: Boolean(
            (imported.state.db ?? imported.state.d1) &&
              (imported.state.db ?? imported.state.d1)!.byteLength > 0
          ),
            secrets: false,
          };
          const chosen = await askStateMove(
            "匯入沙盒狀態",
            "此沙盒包裹含執行期狀態。請選擇要還原的項目（可全部取消勾選，只匯入原始碼）。",
            { confirmLabel: "匯入", icon: "download", initial }
          );
          if (chosen === null) {
            status = "已取消從網址開啟";
            return false;
          }
          stateSel = chosen;
          busy = true;
          openingFromUrl = true;
          openTransferProgress = { ratio: null };
          status = "正在匯入沙盒包裹…";
        }
        const name =
          options.name ||
          defaultNameFromOpenIntent(intent) ||
          imported.meta.name ||
          "imported-project";
        if (replaceSandboxId) {
          status = "正在清空既有沙盒…";
          await deleteInstalledSandboxFully(replaceSandboxId);
          status = "正在重新安裝…";
        }
        const created = await createProject(name, imported.files, {
          ...(replaceSandboxId ? { id: replaceSandboxId } : {}),
          entry: imported.meta.entry,
          source:
            sourceLabelFromOpenIntent(intent) ||
            imported.meta.source ||
            packed.sourceUrl,
          inWorkingSet: true,
        });
        const applied = await applyProjectState(
          created.id,
          imported.state,
          stateSel
        );
        await refreshProjects();
        sandboxId = created.id;
        if (anyStateSelected(applied)) {
          statusExtra = `（含 ${summarizeStateParts(applied)}）`;
        }
      } else if (intent.kind === "github") {
        const remoteFiles = await fetchGithubProject(intent.ref, {
          onProgress: p => {
            openTransferProgress = fileListToOpenProgress(p);
          },
        });
        openTransferProgress = { ratio: 1, detail: "完成" };
        status = "正在寫入本機 OPFS…";
        const name =
          options.name ||
          defaultNameFromOpenIntent(intent) ||
          intent.ref.repo;
        if (replaceSandboxId) {
          status = "正在清空既有沙盒…";
          await deleteInstalledSandboxFully(replaceSandboxId);
          status = "正在重新安裝…";
        }
        const created = await createProject(name, remoteFiles, {
          ...(replaceSandboxId ? { id: replaceSandboxId } : {}),
          source:
            sourceLabelFromOpenIntent(intent) ||
            formatGithubSource(intent.ref),
          inWorkingSet: true,
        });
        await refreshProjects();
        sandboxId = created.id;
      } else {
        const remoteFiles = await fetchGitlabProject(intent.ref, {
          onProgress: p => {
            openTransferProgress = fileListToOpenProgress(p);
          },
        });
        openTransferProgress = { ratio: 1, detail: "完成" };
        status = "正在寫入本機 OPFS…";
        const name =
          options.name ||
          defaultNameFromOpenIntent(intent) ||
          intent.ref.projectPath.split("/").pop() ||
          "gitlab-project";
        if (replaceSandboxId) {
          status = "正在清空既有沙盒…";
          await deleteInstalledSandboxFully(replaceSandboxId);
          status = "正在重新安裝…";
        }
        const created = await createProject(name, remoteFiles, {
          ...(replaceSandboxId ? { id: replaceSandboxId } : {}),
          source: sourceLabelFromOpenIntent(intent) || undefined,
          inWorkingSet: true,
        });
        await refreshProjects();
        sandboxId = created.id;
      }

      await applyOpenFromUrlRole(sandboxId, options.as, false);
      if (options.as === "work") {
        if (replaceSandboxId) {
          status = statusExtra
            ? `已清空並重新安裝本機沙盒${statusExtra}；可用選單複製開啟連結分享`
            : "已清空並重新安裝本機沙盒；可用選單複製開啟連結分享";
        } else if (statusExtra) {
          status = `已從網址開啟沙盒${statusExtra}；可用選單複製開啟連結分享`;
        }
      }
      return true;
    } catch (e) {
      const kind =
        intent.kind === "sam" ||
        intent.kind === "github" ||
        intent.kind === "gitlab"
          ? intent.kind
          : "unknown";
      error = explainOpenFromUrlError(e, kind);
      status = "從網址開啟失敗";
      return false;
    } finally {
      busy = false;
      openingFromUrl = false;
      openTransferProgress = null;
    }
  }

  async function copyTextToClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    throw new Error("無法寫入剪貼簿");
  }

  async function handleCopyOpenLink(source?: string | null) {
    const fromActive = source == null;
    const raw = (source ?? meta?.source ?? "").trim();
    error = null;
    try {
      const url = buildPlaygroundsOpenUrl(raw, {
        origin: fieldShareOrigin(),
        ...(fromActive && meta?.name?.trim()
          ? { name: meta.name.trim() }
          : {}),
      });
      const title =
        fromActive && meta?.name?.trim() ? meta.name.trim() : "遊樂場小品";
      const result = await shareOrCopy({
        title,
        url,
      });
      status =
        result === "shared"
          ? "已分享開啟連結"
          : "已複製開啟連結（對方開啟後會自動匯入）";
    } catch (e) {
      if (isShareAbort(e)) return;
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function handleOpenShareSource() {
    const intent = parseOpenIntent(
      new URLSearchParams({ open: openShareSource.trim() })
    );
    if (!intent || intent.kind === "invalid") {
      error =
        intent?.kind === "invalid"
          ? intent.reason
          : "無法辨識開啟來源（需為 .sam 沙盒包裹網址，或 GitHub／GitLab 公開儲存庫）";
      return;
    }
    closeProjectDialog();
    const ok = await runOpenFromUrl(intent);
    if (ok) {
      enterTryPlayCanvas();
      return;
    }
    if (!ok && !activeId) {
      // Dialog path: ensure workspace is not empty after failure.
      if (projects.length > 0) {
        await openProject(projects[0]!.id);
      }
      // Else stay empty — empty-state「玩玩看」remains available.
    }
  }

  function dismissPlayWelcome() {
    playWelcomeVisible = false;
    try {
      localStorage.setItem(PLAY_WELCOME_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function refreshPlayWelcomeVisibility() {
    try {
      playWelcomeVisible = localStorage.getItem(PLAY_WELCOME_KEY) !== "1";
    } catch {
      playWelcomeVisible = true;
    }
  }

  /** Open a SAM 小品 entry via DEC-025 (`?open=` from entry.source). */
  async function handleOpenCatalogEntry(entry: SamEntry) {
    const intent = parseOpenIntent(
      new URLSearchParams({
        open: samEntryOpenSource(entry),
        name: entry.title,
      })
    );
    if (!intent || intent.kind === "invalid") {
      error =
        intent?.kind === "invalid" ? intent.reason : "無法開啟此小品";
      return;
    }
    const keepTryPlay = tryPlaySession;
    closeProjectDialog();
    closeCatalogBrowser();
    const ok = await runOpenFromUrl(intent);
    if (ok && keepTryPlay) {
      enterTryPlayCanvas();
    }
  }

  /** Try-play chrome: random another小品, stay maximized. */
  async function handleTryPlayRandom() {
    const entry = pickRandomCatalogEntry({
      excludeSource: meta?.source,
    });
    if (!entry) {
      error = "型錄暫時沒有其他小品可換";
      return;
    }
    status = `換一個：${entry.title}`;
    await handleOpenCatalogEntry(entry);
  }

  /**
   * One-click: import open-source 總管小品 (sampot/pg-steward) and set as steward.
   */
  async function handleInstallStewardFromCatalog() {
    const entry = samCatalog.find(e => e.repo === "pg-steward");
    if (!entry) {
      error = "找不到總管小品（pg-steward）";
      return;
    }
    const intent = parseOpenIntent(
      new URLSearchParams({
        open: samEntryOpenSource(entry),
        name: entry.title,
        as: "agent",
        state: "none",
      })
    );
    if (!intent || intent.kind === "invalid") {
      error =
        intent?.kind === "invalid" ? intent.reason : "無法開啟此小品";
      return;
    }
    closeProjectDialog();
    await runOpenFromUrl(intent);
  }

  function onMessage(ev: MessageEvent) {
    const data = ev.data;
    if (!data || typeof data !== "object") return;
    const fromAgent =
      agentIframeEl?.contentWindow &&
      ev.source === agentIframeEl.contentWindow;
    const fromWork =
      iframeEl?.contentWindow && ev.source === iframeEl.contentWindow;

    if (
      fromAgent &&
      (data.type === "playgrounds-open-secret-editor" ||
        data.type === "playgrounds-rotate-secret" ||
        data.type === "playgrounds-unlock-secret-store")
    ) {
      const secretName =
        typeof data.secretName === "string" ? data.secretName.trim() : "";
      void openSecretsDialog({
        intent:
          data.type === "playgrounds-rotate-secret"
            ? "rotate"
            : data.type === "playgrounds-open-secret-editor"
              ? "create"
              : "manage",
        secretName,
      });
      return;
    }

    if (
      data.type === "playgrounds-sam-command" &&
      fromAgent &&
      typeof data.requestId === "string"
    ) {
      const requestId = data.requestId as string;
      const win = agentIframeEl?.contentWindow;
      void (async () => {
        try {
          if (getAgentControllerSandboxId() !== activeAgentSandboxId) {
            throw new Error("agent_controller_not_running");
          }
          const result = await commandAgentController(data.command);
          win?.postMessage(
            {
              type: "playgrounds-sam-command-result",
              requestId,
              ok: true,
              result,
            },
            "*"
          );
        } catch (e) {
          win?.postMessage(
            {
              type: "playgrounds-sam-command-result",
              requestId,
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            },
            "*"
          );
        }
      })();
      return;
    }

    if (data.type === "playgrounds-console-mirror-hello") {
      const win = ev.source;
      if (win && typeof (win as Window).postMessage === "function") {
        postConsoleMirrorToWindow(win as Window);
      }
      return;
    }

    if (data.type === "playgrounds-preview-console") {
      // Hidden functions/controller hosts: silence DevTools only; keep work panel clean.
      if (data.channel === CONSOLE_CHANNEL_ESM_HOST) return;
      const level = String(data.level || "log");
      const text = (data.args || []).join(" ");
      // Only buffer work-canvas lines (agent iframe also posts; filter by source).
      if (!fromAgent) {
        pushWorkConsoleLine(level, text);
      }
    }
    if (data.type === "playgrounds-preview-error") {
      if (data.channel === CONSOLE_CHANNEL_ESM_HOST) return;
      const message = String(data.message);
      if (fromAgent) {
        agentPreviewError = message;
      } else {
        previewError = message;
        pushWorkConsoleLine("error", message);
        bottomPanelOpen = true;
        bottomTab = "console";
      }
    }
    if (data.type === "playgrounds-preview-network" && fromWork) {
      appendWorkNetworkEntry({
        method: String(data.method || "GET"),
        url: String(data.url || ""),
        status: Number(data.status) || 0,
        ok: Boolean(data.ok),
        durationMs: Number(data.durationMs) || 0,
        error: data.error != null ? String(data.error) : undefined,
        contentType:
          data.contentType != null ? String(data.contentType) : undefined,
      });
    }
    if (data.type === "playgrounds-dom-snapshot-response" && fromWork) {
      const id = String(data.id || "");
      const pending = pendingDomSnapshots.get(id);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingDomSnapshots.delete(id);
      if (data.error) {
        pending.reject(
          new HostBridgeError("not_supported", String(data.error))
        );
        return;
      }
      pending.resolve({
        text: String(data.text || ""),
        truncated: Boolean(data.truncated),
      });
    }
  }

  function requestWorkDomSnapshot(maxChars: number): Promise<HostDomSnapshotResult> {
    const win = iframeEl?.contentWindow;
    if (!win || !iframeEl?.src || iframeEl.src === "about:blank") {
      return Promise.reject(
        new HostBridgeError("no_target", "工作畫布尚未載入")
      );
    }
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const clamped = clampDomSnapshotMaxChars(maxChars);
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingDomSnapshots.delete(id);
        reject(new HostBridgeError("timeout", "getDomSnapshot 逾時"));
      }, 5_000);
      pendingDomSnapshots.set(id, { resolve, reject, timer });
      win.postMessage(
        {
          type: "playgrounds-dom-snapshot-request",
          id,
          maxChars: clamped,
        },
        "*"
      );
    });
  }

  /** Best-effort same-origin PNG via SVG foreignObject (see canvasCapture.ts). */
  function captureWorkCanvasPng(opts?: {
    maxWidth?: number;
  }): Promise<{ base64: string; mime: "image/png" }> {
    const doc = iframeEl?.contentDocument;
    if (!doc?.documentElement || !iframeEl?.src || iframeEl.src === "about:blank") {
      return Promise.reject(
        new HostBridgeError("no_target", "工作畫布尚未載入")
      );
    }
    return captureDocumentToPng(doc, {
      maxWidth: opts?.maxWidth,
      baseUrl: iframeEl.src,
    });
  }

  function onDialogClose() {
    projectDialogOpen = false;
  }

  async function refreshSecretStoreUi() {
    try {
      secretStoreStatus = await getSecretStoreStatus();
      secretMetas = await listSecretMetas();
    } catch {
      secretStoreStatus = { state: "absent" };
      secretMetas = [];
    }
    try {
      const probe = await probeWebAuthnPrfAvailability();
      webauthnPrfAvailable = probe.available;
      webauthnPrfReason = probe.available ? "" : probe.reason;
    } catch {
      webauthnPrfAvailable = false;
      webauthnPrfReason = "無法偵測生物識別支援";
    }
  }

  async function openSecretsDialog(options?: {
    intent?: "manage" | "create" | "rotate";
    secretName?: string;
  }) {
    secretEditorIntent = options?.intent ?? "manage";
    secretNameDraft = options?.secretName?.trim() ?? "";
    secretValueDraft = "";
    storePasswordDraft = "";
    storePasswordConfirm = "";
    secretsDialogOpen = true;
    await refreshSecretStoreUi();
    queueMicrotask(() => secretsDialogEl?.showModal());
  }

  function closeSecretsDialog() {
    secretsDialogOpen = false;
    secretEditorIntent = "manage";
    secretsDialogEl?.close();
  }

  function onSecretsDialogClose() {
    secretsDialogOpen = false;
    secretEditorIntent = "manage";
  }

  async function handleInitSecretStore() {
    if (storePasswordDraft !== storePasswordConfirm) {
      error = "兩次密碼不一致";
      return;
    }
    try {
      await initializeSecretStore(storePasswordDraft);
      storePasswordDraft = "";
      storePasswordConfirm = "";
      await refreshSecretStoreUi();
      status = "密鑰庫已建立並解鎖";
      error = null;
      notifySecretStoreUnlocked();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function notifySecretStoreUnlocked() {
    agentIframeEl?.contentWindow?.postMessage(
      { type: "playgrounds-secret-store-unlocked" },
      "*"
    );
  }

  async function handleUnlockSecretStore() {
    try {
      await unlockSecretStore(storePasswordDraft);
      storePasswordDraft = "";
      await refreshSecretStoreUi();
      status = "密鑰庫已解鎖";
      error = null;
      notifySecretStoreUnlocked();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      error =
        msg === "secret_auth_failed" ? "密碼錯誤" : msg;
    }
  }

  async function handleUnlockSecretStoreWebAuthn() {
    try {
      await unlockSecretStoreWithWebAuthn();
      await refreshSecretStoreUi();
      status = "密鑰庫已以生物識別解鎖";
      error = null;
      notifySecretStoreUnlocked();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "secret_auth_failed") {
        error = "生物識別已取消或失敗";
      } else if (msg === "secret_webauthn_unavailable") {
        error = webauthnPrfReason || "此環境無法使用生物識別解鎖";
      } else {
        error = msg;
      }
    }
  }

  async function handleRegisterWebAuthn() {
    if (!webauthnRegisterPassword.trim()) {
      error = "請輸入復原密碼以登錄生物識別";
      return;
    }
    try {
      await registerWebAuthnUnlock(webauthnRegisterPassword);
      webauthnRegisterPassword = "";
      await refreshSecretStoreUi();
      status = "已登錄生物識別解鎖";
      error = null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "secret_auth_failed") {
        error = "密碼錯誤或生物識別已取消";
      } else if (msg === "secret_webauthn_unavailable") {
        error = webauthnPrfReason || "此環境無法登錄生物識別（需 WebAuthn PRF）";
      } else {
        error = msg;
      }
    }
  }

  async function handleUnregisterWebAuthn() {
    const ok = await askConfirm("移除生物識別解鎖？之後僅能用復原密碼解鎖。", {
      title: "移除生物識別",
      confirmLabel: "移除",
      tone: "danger",
      icon: "key",
    });
    if (!ok) return;
    try {
      await unregisterWebAuthnUnlock();
      await refreshSecretStoreUi();
      status = "已移除生物識別解鎖";
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function handleLockSecretStore() {
    lockSecretStore();
    await refreshSecretStoreUi();
    status = "密鑰庫已鎖定";
  }

  async function handleDestroySecretStore() {
    const ok = await askConfirm(
      "銷毀整個密鑰庫？密文將無法復原（忘記密碼時才用）。",
      {
        title: "銷毀 SecretStore",
        confirmLabel: "銷毀",
        tone: "danger",
        icon: "key",
      }
    );
    if (!ok) return;
    try {
      await destroySecretStore();
      await refreshSecretStoreUi();
      secretNameDraft = "";
      secretValueDraft = "";
      status = "SecretStore 已銷毀";
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function handleSaveSecret() {
    const name = secretNameDraft.trim();
    if (!name) {
      error = "請輸入密鑰名稱";
      return;
    }
    if (!secretValueDraft) {
      error = "請輸入密鑰值";
      return;
    }
    try {
      await setSecret(name, secretValueDraft);
      secretValueDraft = "";
      if (secretEditorIntent !== "manage") {
        secretNameDraft = name;
      } else {
        secretNameDraft = "";
      }
      await refreshSecretStoreUi();
      status = `已儲存密鑰 ${name}（env.${name}.get()；不進沙盒包裹）`;
      error = null;
      if (secretEditorIntent === "create" || secretEditorIntent === "rotate") {
        agentIframeEl?.contentWindow?.postMessage(
          {
            type: "playgrounds-secret-editor-done",
            intent: secretEditorIntent,
            secretName: name,
          },
          "*"
        );
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function handleDeleteSecret(name: string) {
    const ok = await askConfirm(`刪除密鑰「${name}」？`, {
      title: "刪除密鑰",
      confirmLabel: "刪除",
      tone: "danger",
      icon: "key",
    });
    if (!ok) return;
    try {
      await deleteSecret(name);
      await refreshSecretStoreUi();
      status = `已刪除密鑰 ${name}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function onKeydown(ev: KeyboardEvent) {
    const mod = ev.metaKey || ev.ctrlKey;
    if (!mod) return;
    const key = ev.key.toLowerCase();
    if (key === "s") {
      ev.preventDefault();
      void flushSave();
    } else if (key === "enter") {
      ev.preventDefault();
      showAndRebuildPreview();
    } else if (key === "p" && ev.shiftKey) {
      ev.preventDefault();
      openProjectDialog();
    }
  }

  function toggleFilesSidebar() {
    filesSidebarOpen = !filesSidebarOpen;
    try {
      localStorage.setItem(
        "playgrounds-files-sidebar",
        filesSidebarOpen ? "open" : "collapsed"
      );
    } catch {
      /* ignore quota / private mode */
    }
  }

  function onBlogThemeChange() {
    // iframe color-scheme drives prefers-color-scheme; avoid full canvas reload
    // (reload races Service Worker snapshots and surfaces noisy 503s).
    syncAllIframeColorSchemes();
  }

  /** Stop restored iframe navigations from hitting canvas SW before shell re-syncs. */
  function blankCanvasIframes() {
    clearPreview();
    clearAgentPreview();
    for (const tab of listCanvasTabs(mainTabs)) {
      blankCanvasIframe(tab.id);
    }
    for (const el of participantIframeEls.values()) {
      el.removeAttribute("srcdoc");
      el.src = "about:blank";
    }
  }

  async function handleOpenIntentFromLocation(search: string): Promise<boolean> {
    const intent = parseOpenIntent(search);
    if (!intent) return false;
    return beginSharedBootOpen(search, async () => {
      if (intent.kind === "invalid") {
        error = intent.reason;
        clearOpenQueryParam();
        return false;
      }
      try {
        const ok = await runOpenFromUrl(intent);
        if (ok && intent.options.view === "canvas") {
          enterTryPlayCanvas();
        }
        return ok;
      } finally {
        clearOpenQueryParam();
      }
    });
  }

  /** ClientRouter may land on `?open=` without remounting this island. */
  function onAstroPageLoadForOpen() {
    if (!openFromUrlBootReady || !supported) return;
    const search = window.location.search;
    if (!parseOpenIntent(search)) return;
    void handleOpenIntentFromLocation(search);
  }

  function dismissMigrateBanner(): void {
    migrateBannerVisible = false;
    try {
      sessionStorage.setItem(MIGRATE_BANNER_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  onMount(() => {
    if (bootConsumerPlay) {
      // Before layout restore: keep page chrome play-first from first paint.
      syncPageChrome();
    }
    canWebShare = canUseWebShare();
    installPlatformFieldCredentialLifecycle();
    syncPlatformFieldLoginState();
    const unsubFieldCred = subscribePlatformFieldCredential(() => {
      syncPlatformFieldLoginState();
    });
    unsubPlatformFieldCred = unsubFieldCred;
    applyPlaygroundsPathsFromLocation({
      pathname: window.location.pathname,
      hostname: window.location.hostname,
    });
    // Roster OOB wire still uses 線上 tab. Platform `#pg=` guest join is shell
    // modal + maximized SAM — do not force AvatarsPanel / IDE chrome.
    if (
      hasRosterInviteInLocation({
        hash: window.location.hash,
        search: window.location.search,
      })
    ) {
      filesSidebarOpen = true;
      selectSidebarTab("avatars");
    }
    const landingPgInvite = hasPgInviteInLocation({
      hash: window.location.hash,
      search: window.location.search,
    });
    void consumePgProvisionFromLocation().then((result) => {
      if (result.ok === true) {
        status = "已登入遊樂場通行證（僅本頁有效）";
        syncPlatformFieldLoginState();
      } else if ("error" in result && result.error) {
        status = `通行證兌換失敗：${result.error}`;
      }
    });
    const unregCompose = registerPlatformComposeShell({
      openSamSource: async (source, opts) => {
        const intent = parseOpenIntent(
          new URLSearchParams({ open: source.trim() })
        );
        if (!intent || intent.kind === "invalid") {
          throw new Error(
            intent?.kind === "invalid"
              ? intent.reason
              : "無法辨識開啟來源"
          );
        }
        const preferReuse = opts?.preferReuse === true;
        if (preferReuse) {
          const existingId = findSandboxIdByOpenSource(projects, intent);
          if (existingId) {
            await openProject(existingId);
            return;
          }
        }
        // Guest invite: skip replace/keep dialog; install under a new id.
        const toOpen = preferReuse
          ? {
              ...intent,
              options: { ...intent.options, fresh: true },
            }
          : intent;
        const ok = await runOpenFromUrl(toOpen);
        if (!ok) {
          throw new Error(error?.trim() || "開啟小品失敗");
        }
      },
      maximizePreview: () => {
        maximizePreview();
      },
      enterTryPlayCanvas: () => {
        enterTryPlayCanvas({ invite: invitePlaySession || bootInvitePlay });
      },
      getActiveSandboxId: () => activeId || null,
    });
    unregPlatformCompose = unregCompose;
    unregPlatformInviteShare = registerPlatformInviteShareShell({
      present: payload => {
        inviteSharePayload = {
          shortUrl: payload.shortUrl,
          deepLink: payload.deepLink,
          expiresAt: payload.expiresAt,
          kind: payload.kind,
          title: payload.title,
          hint: payload.hint,
        };
        inviteShareOpen = true;
      },
      dismiss: () => {
        inviteShareOpen = false;
      },
    });
    unregPlatformInviteJoin = registerPlatformInviteJoinShell({
      present: payload => {
        inviteJoinPayload = payload;
        inviteJoinPending = false;
        inviteJoinError = null;
        inviteJoinRecovery = null;
        inviteJoinCopyUrl = null;
        inviteJoinStatus = null;
        inviteJoinBusy = false;
        inviteJoinOpen = true;
      },
      presentPending: opts => {
        inviteJoinPayload = null;
        inviteJoinPending = !opts.error && !opts.recovery;
        inviteJoinError = opts.error ?? null;
        inviteJoinRecovery = opts.recovery ?? null;
        inviteJoinCopyUrl = opts.copyUrl?.trim() || null;
        inviteJoinStatus = null;
        inviteJoinBusy = false;
        inviteJoinOpen = true;
      },
      dismiss: () => {
        inviteJoinOpen = false;
      },
    });
    if (landingPgInvite) {
      // Cover IDE chrome ASAP; full consume runs after OPFS boot.
      presentPlatformInviteJoinPending({});
    }
    const unregRosterInvite = registerRosterInviteAcceptedHandler(ev =>
      onRosterInviteAccepted(ev)
    );
    unregRosterInviteAccepted = unregRosterInvite;
    unregRosterRemoteAct = registerRosterRemoteActHandler(ev =>
      onRosterRemoteAct(ev)
    );
    unregRosterHomeSeatReady = registerRosterHomeSeatReadyHandler(ev =>
      onRosterHomeSeatReady(ev)
    );
    if (
      isPlaygroundsLegacyMount(
        window.location.pathname,
        window.location.hostname
      )
    ) {
      try {
        migrateBannerVisible =
          sessionStorage.getItem(MIGRATE_BANNER_SESSION_KEY) !== "1";
      } catch {
        migrateBannerVisible = true;
      }
    }
    // Re-sync theme/font button state after Svelte mounts toolbar controls.
    document.dispatchEvent(new Event("appearance-controls-ready"));
    supported = isOpfsSupported();
    if (import.meta.env.DEV) {
      installFleetStressHooks();
    }
    unsubAgentRuntimeRole = subscribeAgentRuntimeRole(status => {
      agentRuntimeStatus = status;
    });
    setSessionMailboxFanout(async items => {
      const hub = await getAgentRuntimeHub();
      for (const item of items) {
        try {
          if (!(await hub.runtime.registry.lookup(item.agentId))) {
            await hub.runtime.registry.register({
              agentId: item.agentId,
              sandboxId: item.sandboxId,
              status: "registered",
            });
          }
          await hub.runtime.send({
            to: item.agentId,
            from: "system",
            type: "session.event",
            payload: { seq: item.seq, event: item.event },
          });
        } catch {
          /* mailbox_full / not_found — BC still delivered */
        }
      }
    });
    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("pointerdown", onToolbarMenusPointerDown);
    document.addEventListener("theme-change", onBlogThemeChange);
    document.addEventListener("astro:page-load", onAstroPageLoadForOpen);
    window.addEventListener("pagehide", blankCanvasIframes);
    loadLayout();
    shellPrefs = readPlaygroundsPrefs();
    syncPageChrome();
    void clearLegacyProjectSecretsRoot();
    void refreshSecretStoreUi();
    try {
      const saved =
        localStorage.getItem("playgrounds-files-sidebar") ??
        localStorage.getItem("ide-files-sidebar");
      if (saved === "collapsed") filesSidebarOpen = false;
      if (saved === "open") filesSidebarOpen = true;
    } catch {
      /* ignore */
    }
    if (landingPgInvite || bootConsumerPlay) {
      // Consumer landing: layout restore must not re-expose the IDE.
      filesSidebarOpen = false;
      previewOpen = true;
      enterTryPlayCanvas({ invite: landingPgInvite || bootInvitePlay });
    }
    if (!supported) {
      error = "此瀏覽器不支援 OPFS，無法作為本機實驗環境。";
      return;
    }
    unregisterCanvasApi = registerCanvasApiHandler({
      getSandboxId: () => activeId,
      getFiles: () => files,
      getActiveAgentSandboxId: () => activeAgentSandboxId,
      getActiveToolSandboxId: () =>
        findGrantCanvasTab(mainTabs)?.sandboxId ??
        activeToolSession?.toolSandboxId ??
        null,
      getDelegateGrantFor: sandboxId => {
        const entry = getDelegateGrant(sandboxId);
        if (entry) {
          return {
            hostSandboxId: entry.grant.hostSandboxId,
            paths: [...entry.grant.paths],
            mode: entry.grant.mode,
            ...(entry.focusPath ? { focusPath: entry.focusPath } : {}),
          };
        }
        const tab = findCanvasBySandboxId(mainTabs, sandboxId);
        if (tab?.grant) {
          return {
            hostSandboxId: tab.grant.hostSandboxId,
            paths: [...tab.grant.paths],
            mode: tab.grant.mode,
            ...(tab.focusPath ? { focusPath: tab.focusPath } : {}),
          };
        }
        return null;
      },
      getFilesForProject: (sandboxId: string) => {
        if (sandboxId === activeId) {
          return Object.keys(files).length > 0 ? files : null;
        }
        if (sandboxId === activeAgentSandboxId) {
          // Avoid {} → functions.js "missing" 503 while boot/HMR loads agentFiles.
          return Object.keys(agentFiles).length > 0 ? agentFiles : null;
        }
        const canvasTab = findCanvasBySandboxId(mainTabs, sandboxId);
        if (canvasTab) {
          const rt = canvasRuntimeByTabId[canvasTab.id];
          return rt && Object.keys(rt.files).length > 0 ? rt.files : null;
        }
        if (participantFilesById[sandboxId]) {
          return participantFilesById[sandboxId]!;
        }
        // Fleet / steward Controllers registered on this tab (may not be open pane).
        const desired = getDesiredAgentFiles(sandboxId);
        if (desired && Object.keys(desired).length > 0) return desired;
        return null;
      },
      // DEC-031: Leader may execute /api for a follower canvas whose FileMap
      // is not in this tab's open panes — load from OPFS (shared across tabs).
      resolveFilesForProject: async (sandboxId: string) => {
        try {
          const loaded = await loadProjectFiles(sandboxId);
          return Object.keys(loaded).length > 0 ? loaded : null;
        } catch {
          return null;
        }
      },
      getSessionHostSandboxId: () =>
        sessionRuntime.getSession()?.hostSandboxId ?? null,
      shellSessionHttp: {
        getStatus: () => {
          const s = sessionRuntime.getSession();
          if (!s) return { active: false as const, seats: [] };
          return {
            active: true as const,
            status: s.status,
            sessionId: s.sessionId,
            channelName: s.channelName,
            protocol: {
              protocolId: s.protocol.protocolId,
              apiVersion: s.protocol.apiVersion,
              roles: [...s.protocol.roles],
              ...(s.protocol.roleLimits
                ? { roleLimits: { ...s.protocol.roleLimits } }
                : {}),
              ...(s.protocol.joinPolicy
                ? { joinPolicy: s.protocol.joinPolicy }
                : {}),
            },
            seats: sessionRuntime.listSeats().map(seat => ({
              seatId: seat.seatId,
              role: seat.role,
              kind: seat.kind,
              sandboxId: seat.sandboxId ?? "",
              paused: seat.paused,
              ...(seat.remote ? { remote: { ...seat.remote } } : {}),
            })),
          } satisfies import("./shellSessionHttp").ShellSessionHttpStatus;
        },
        open: async () => {
          const opened = await openMultiAgentSession();
          return {
            sessionId: opened.sessionId,
            channelName: opened.channelName,
            protocol: {
              protocolId: opened.protocolId,
              apiVersion: opened.apiVersion,
              roles: opened.roles,
            },
          };
        },
        close: async () => {
          await closeMultiAgentSession();
        },
        pause: async () => {
          sessionRuntime.pause();
          syncMultiAgentSessionView();
        },
        resume: async () => {
          sessionRuntime.resume();
          syncMultiAgentSessionView();
        },
        listProjects: () =>
          projects
            .filter(p => p.id !== activeId)
            .map(p => ({ id: p.id, name: p.name })),
        join: opts => joinMultiAgentSeat(opts),
        leave: seatId => leaveMultiAgentSeat(seatId),
        spawnParticipant: opts => spawnMultiAgentParticipant(opts),
        inviteRoster: opts => inviteRosterAvatarSeat(opts),
        hostDomainFetch: opts =>
          hostSessionDomainFetch(opts.path, {
            method: opts.method,
            headers: opts.headers,
            body: opts.body,
          }),
      },
      shellPlatformHttp: {
        createInvite: async opts => {
          const inviteShell = getPlatformInviteShell();
          if (!inviteShell) {
            throw new HostBridgeError(
              "not_found",
              "線上邀請服務尚未就緒 — 請打開側欄「線上」後再試"
            );
          }
          return inviteShell.mintAndAnswer(opts);
        },
      },
      onConsole: line => {
        pushWorkConsoleLine(line.level, line.text);
        bottomPanelOpen = true;
        bottomTab = "console";
      },
    });
    const toolShell = createShellToolBridge({
      getSessionFor: sandboxId => {
        if (activeToolSession?.toolSandboxId === sandboxId) {
          return activeToolSession;
        }
        const entry = getDelegateGrant(sandboxId);
        if (!entry) return null;
        return {
          toolSandboxId: sandboxId,
          grant: entry.grant,
          focusPath: entry.focusPath,
        };
      },
      getSession: () => activeToolSession,
      getActiveId: () => activeId,
      getActiveAgentId: () => activeAgentSandboxId,
      getHostFiles: () => files,
      getFilesForHost: hostId => {
        if (hostId === activeId) return files;
        // Canvas tabs do not cache FileMap; callers use resolveFilesForProject / OPFS.
        return null;
      },
      patchHostFile: async (path, content) => {
        if (!activeId) return;
        files = { ...files, [path]: content };
        meta = await saveFile(activeId, path, content);
        if (openPath === path && isTextContent(files[path])) {
          const text = files[path];
          draft = typeof text === "string" ? text : draft;
        }
        const reload = writeShouldReloadCanvas(path);
        if (reload) schedulePreview(true);
        if (activeId === activeAgentSandboxId) {
          agentFiles = files;
          if (reload) void rebuildAgentPreview();
        }
        await refreshProjects();
      },
      closeToolSession: () => closeToolSession(),
    });
    registerToolBridge(toolShell);
    registerScopedDelegateHost(toolShell);
    registerComputeFilesAccess({
      loadFiles: async sandboxId => {
        if (sandboxId === activeId) return files;
        return loadProjectFiles(sandboxId);
      },
      writeFile: async (sandboxId, path, content) => {
        if (sandboxId === activeId) {
          files = { ...files, [path]: content };
          if (openPath === path && typeof content === "string") {
            draft = content;
          }
          await saveFile(sandboxId, path, content);
          if (writeShouldReloadCanvas(path)) schedulePreview(true);
          return;
        }
        await saveFile(sandboxId, path, content);
      },
    });
    registerHostBridge(
      createShellHostBridge({
        getActiveId: () => activeId,
        getActiveAgentId: () => activeAgentSandboxId,
        setActiveAgentId: async (id, opts) => {
          const previousId = activeAgentSandboxId;
          await applyActiveAgent(id, opts);
          await offerRetirePreviousSteward(previousId, id);
        },
        getTargetOverride: () => targetProjectOverride,
        setTargetOverride: id => {
          targetProjectOverride = id;
        },
        openProject: id => openProject(id),
        openEditorFile: path => {
          selectFile(path);
        },
        openToolSession: opts => openToolSession(opts),
        closeToolSession: () => closeToolSession(),
        getToolSession: () => {
          const tab = listCanvasTabs(mainTabs).find(t => t.grant);
          if (!tab?.grant) return null;
          return {
            toolSandboxId: tab.sandboxId,
            hostSandboxId: tab.grant.hostSandboxId,
            paths: [...tab.grant.paths],
            mode: tab.grant.mode,
            ...(tab.focusPath ? { focusPath: tab.focusPath } : {}),
          };
        },
        openMainCanvas: opts => openMainCanvasSession(opts),
        closeMainTab: opts => closeMainContentTab(opts?.tabId),
        setMainTab: async opts => {
          await selectMainContentTab(opts.tabId);
          return summarizeMainTab(getActiveTab(mainTabs, activeMainTabId));
        },
        listMainTabs: () => ({
          tabs: mainTabSummaries,
          activeTabId: activeMainTabId,
        }),
        getMainTab: () =>
          summarizeMainTab(getActiveTab(mainTabs, activeMainTabId)),
        openMultiAgentSession: opts => openMultiAgentSession(opts),
        closeMultiAgentSession: () => closeMultiAgentSession(),
        pauseMultiAgentSession: () => {
          sessionRuntime.pause();
          syncMultiAgentSessionView();
        },
        resumeMultiAgentSession: () => {
          sessionRuntime.resume();
          syncMultiAgentSessionView();
        },
        getMultiAgentSession: () => {
          const s = sessionRuntime.getSession();
          if (!s) return null;
          return {
            sessionId: s.sessionId,
            channelName: s.channelName,
            protocolId: s.protocol.protocolId,
            apiVersion: s.protocol.apiVersion,
            status: s.status,
            roles: [...s.protocol.roles],
          };
        },
        listMultiAgentSeats: () =>
          sessionRuntime.listSeats().map(s => ({
            seatId: s.seatId,
            role: s.role,
            kind: s.kind,
            sandboxId: s.sandboxId,
            paused: s.paused,
          })),
        joinMultiAgentSeat: opts => joinMultiAgentSeat(opts),
        leaveMultiAgentSeat: seatId => leaveMultiAgentSeat(seatId),
        spawnMultiAgentParticipant: opts => spawnMultiAgentParticipant(opts),
        hostSessionDomainFetch: (path, init) =>
          hostSessionDomainFetch(path, init),
        afterProjectDeleted: id => clearShellStateForDeletedProject(id),
        getWorkFiles: () => files,
        getWorkDirs: () => dirs,
        getCanvasGeneration: () => canvasGeneration,
        patchWorkFile: async (path, content, options) => {
          if (!activeId) return;
          files = { ...files, [path]: content };
          meta = await saveFile(activeId, path, content);
          if (openPath === path && isTextContent(files[path])) {
            draft = typeof files[path] === "string" ? files[path] : draft;
          }
          const reload =
            options?.reloadCanvas ?? writeShouldReloadCanvas(path);
          if (reload) schedulePreview(true);
          if (activeId === activeAgentSandboxId) {
            agentFiles = files;
            if (reload) void rebuildAgentPreview();
          }
          await refreshProjects();
        },
        removeWorkPath: async path => {
          if (!activeId) return;
          if (path in files) {
            meta = await deleteFile(activeId, path);
            const next = { ...files };
            delete next[path];
            files = next;
            if (openPath === path) {
              openPath = null;
              draft = "";
            }
          } else {
            meta = await deleteDir(activeId, path);
            await refreshDirs(activeId);
          }
          schedulePreview(true);
          await refreshProjects();
        },
        reloadWorkCanvas: () => {
          showAndRebuildPreview();
        },
        refreshProjectList: () => refreshProjects(),
        replaceWorkProject: async (nextFiles, nextDirs) => {
          files = nextFiles;
          dirs = nextDirs;
          if (openPath && !(openPath in nextFiles)) {
            openPath = null;
            draft = "";
          } else if (openPath && isTextContent(nextFiles[openPath])) {
            const text = nextFiles[openPath];
            draft = typeof text === "string" ? text : draft;
          }
          if (activeId) {
            meta = await readMeta(activeId);
          }
        },
        onConsoleCleared: () => {
          consoleLines = [];
        },
        onNetworkCleared: () => {
          /* buffer is shell-authoritative; no UI panel yet */
        },
        requestDomSnapshot: maxChars => requestWorkDomSnapshot(maxChars),
        captureWorkCanvas: opts => captureWorkCanvasPng(opts),
        getWorkCanvasViewport: () => measureWorkCanvasViewport(iframeEl),
      })
    );
    void ensureCanvasServiceWorker()
      .then(() => {
        canvasSwReady = true;
      })
      .catch(e => {
        previewError =
          e instanceof Error
            ? e.message
            : "畫布 Service Worker 註冊失敗";
      });
    // SW updates wipe in-memory canvas snapshots; re-push OPFS files so
    // preview / Agent iframes do not stick on "Canvas snapshot not ready".
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        canvasSwReady = true;
        if (meta && DEFAULT_ENTRY in files) schedulePreview(true);
        if (activeAgentSandboxId && DEFAULT_ENTRY in agentFiles) {
          void rebuildAgentPreview();
        }
      });
    }
    void (async () => {
      let inviteBootBlocked = false;
      try {
        await refreshProjects();
        const savedAgent = readActiveAgentSandboxId();
        if (savedAgent && projects.some(p => p.id === savedAgent)) {
          activeAgentSandboxId = savedAgent;
        }

        // Defer clearing `?open=` until after import so Astro ClientRouter
        // remounts can still see the intent (clearing first caused silent misses).
        const openedFromUrl = await handleOpenIntentFromLocation(
          window.location.search
        );

        if (!openedFromUrl) {
          // Guest `#pg=`: don't open a previous work sandbox — avoids OPFS races
          // with invite install／open, and keeps the play surface clean.
          if (projects.length > 0 && !landingPgInvite) {
            const savedWork = readActiveWorkSandboxId();
            const initialId =
              savedWork && projects.some(p => p.id === savedWork)
                ? savedWork
                : projects[0]!.id;
            await openProject(initialId);
          }
          // First visit (no sandboxes): leave empty so「玩玩看」empty-state can show.
        }
        refreshPlayWelcomeVisibility();
        // Remember designation always; Controller can run headless (DEC-024).
        // Mount Agent canvas only if last tab was Agent.
        if (activeAgentSandboxId) {
          if (sidebarTab === "agent") {
            await applyActiveAgent(activeAgentSandboxId, { reveal: false });
          } else {
            await applyActiveAgent(activeAgentSandboxId, {
              reveal: false,
              mountUi: false,
            });
          }
        }
        // Rehydrate Agent-form Controllers (DEC-031; not only 總管席).
        await ensureWorkingSetAgentControllers();
      } catch (e) {
        if (landingPgInvite && isInviteStorageRestrictedError(e)) {
          inviteBootBlocked = true;
          error = null;
          const parsed = parsePgInviteFromLocation({
            hash: window.location.hash,
            search: window.location.search,
          });
          let copyUrl: string | null = null;
          if (parsed) {
            try {
              copyUrl = buildPgInviteDeepLink({
                origin: window.location.origin,
                pathname: window.location.pathname || "/",
                secret: parsed.secret,
              });
            } catch {
              copyUrl = null;
            }
          }
          presentPlatformInviteJoinPending({
            error: INVITE_STORAGE_RESTRICTED_TITLE,
            recovery: "open_in_safari",
            copyUrl,
          });
        } else if (landingPgInvite) {
          inviteBootBlocked = true;
          error = null;
          presentPlatformInviteJoinPending({
            error: "無法讀取邀請，請稍後再試",
          });
        } else {
          error = explainOpenFromUrlError(e, "unknown");
        }
      } finally {
        openFromUrlBootReady = true;
        shellBootReady = true;
        // After OPFS／open boot: Guest `#pg=` → SAM maximized + consent modal.
        if (landingPgInvite && !inviteBootBlocked) {
          void consumePgInviteFromLocation();
        }
      }
    })();
  });

  async function onInviteJoinAccept(opts: {
    displayName: string;
  }): Promise<void> {
    const payload = inviteJoinPayload;
    if (!payload) return;
    inviteJoinBusy = true;
    inviteJoinError = null;
    inviteJoinRecovery = null;
    inviteJoinStatus = "正在與主持握手…";
    try {
      const proto = composeSessionProtocol(payload.meta.intent);
      let composeProtocolId: string | null = null;
      if (
        proto &&
        typeof proto === "object" &&
        "protocolId" in proto &&
        typeof (proto as { protocolId: unknown }).protocolId === "string"
      ) {
        composeProtocolId = (proto as { protocolId: string }).protocolId.trim();
      }
      await guestJoinPlatformTicket({
        secret: payload.secret,
        meta: payload.meta,
        composeProtocolId,
        displayName: opts.displayName,
      });
      inviteJoinStatus = "已連線，等待入座…";
      inviteJoinOpen = false;
      status = "已同意入座 — 連線中";
    } catch (e) {
      inviteJoinError =
        e instanceof Error ? e.message : String(e);
      inviteJoinStatus = null;
    } finally {
      inviteJoinBusy = false;
    }
  }

  function onInviteJoinDecline(): void {
    inviteJoinOpen = false;
    inviteJoinPayload = null;
    inviteJoinPending = false;
    inviteJoinError = null;
    inviteJoinRecovery = null;
    inviteJoinCopyUrl = null;
    inviteJoinStatus = null;
    inviteJoinBusy = false;
  }

  onDestroy(() => {
    unregPlatformCompose?.();
    unregPlatformCompose = null;
    unregPlatformInviteShare?.();
    unregPlatformInviteShare = null;
    unregPlatformInviteJoin?.();
    unregPlatformInviteJoin = null;
    unsubPlatformFieldCred?.();
    unsubPlatformFieldCred = null;
    unregRosterInviteAccepted?.();
    unregRosterInviteAccepted = null;
    unregRosterRemoteAct?.();
    unregRosterRemoteAct = null;
    unregRosterHomeSeatReady?.();
    unregRosterHomeSeatReady = null;
    unsubAgentRuntimeRole?.();
    unsubAgentRuntimeRole = null;
    setSessionMailboxFanout(null);
    setRosterOpenSession(null);
    for (const [, pending] of pendingDomSnapshots) {
      clearTimeout(pending.timer);
      pending.reject(new HostBridgeError("cancelled", "遊樂場已卸載"));
    }
    pendingDomSnapshots.clear();
    void stopAgentController();
    disposeHostPythonRunner();
    disposeHostJsRunner();
    disposeHostWasiRunner();
    clearAllBottomSamPanels();
    window.removeEventListener("message", onMessage);
    window.removeEventListener("keydown", onKeydown);
    window.removeEventListener("pointerdown", onToolbarMenusPointerDown);
    document.removeEventListener("theme-change", onBlogThemeChange);
    document.removeEventListener("astro:page-load", onAstroPageLoadForOpen);
    window.removeEventListener("pagehide", blankCanvasIframes);
    openFromUrlBootReady = false;
    blankCanvasIframes();
    sandboxMaximized = false;
    previewMaximized = false;
    editorMaximized = false;
    tryPlaySession = false;
    syncPageChrome();
    unregisterCanvasApi?.();
    unregisterCanvasApi = null;
    registerHostBridge(null);
    registerToolBridge(null);
    registerScopedDelegateHost(null);
    registerComputeFilesAccess(null);
    void closeMultiAgentSession({ offerSeatCleanup: false });
    invalidateFunctionsModuleCache();
    if (saveTimer) clearTimeout(saveTimer);
    if (previewTimer) clearTimeout(previewTimer);
    if (savedTimer) clearTimeout(savedTimer);
    void flushSave();
    clearPreview();
    clearAgentPreview();
  });
</script>

<div class="playgrounds-root text-skin-base bg-skin-fill">
  {#if migrateBannerVisible}
    <div
      class="playgrounds-migrate-banner border-skin-line bg-skin-card text-skin-base border-b px-3 py-2 text-sm"
      role="status"
    >
      <p class="min-w-0 flex-1 leading-snug">
        正式遊樂場在
        <a
          class="text-skin-accent underline decoration-dashed underline-offset-2"
          href={playgroundsCanonicalHomeUrl()}
          rel="noopener noreferrer"
          >play.samkuo.me</a
        >
        。此頁為過渡舊場；沙盒與密鑰綁在這個網址的瀏覽器資料，不會自動過去——請先匯出
        <code class="text-xs">.sam</code>
        ，再到新網址匯入。密鑰庫與介面偏好須在新場重設。
      </p>
      <button
        type="button"
        class="text-skin-base/60 hover:text-skin-base shrink-0 px-1 text-lg leading-none"
        title="這個分頁先關掉提醒"
        aria-label="關閉遷移提醒"
        onclick={dismissMigrateBanner}
      >
        ×
      </button>
    </div>
  {/if}
  {#if !previewMaximized && !editorMaximized}
  <header
    class="playgrounds-toolbar border-skin-line shrink-0 border-b {workIsActiveAgent
      ? 'playgrounds-toolbar--agent-linked'
      : ''}"
  >
    <span class="playgrounds-toolbar-brand">遊樂場</span>
    <div
      class="playgrounds-toolbar-auth"
      role="status"
      aria-label="遊樂場通行證"
    >
      {#if platformFieldLoggedIn}
        <span class="text-skin-base/55 hidden text-[11px] sm:inline">已登入</span>
        <button
          type="button"
          class="{btn} h-8 min-h-8 gap-1 px-2.5 text-[11px]"
          title="清除本頁通行證（關閉頁面也會清除）"
          onclick={logoutPlatformField}
        >
          登出
        </button>
      {:else}
        <span class="text-skin-base/45 hidden text-[11px] sm:inline">未登入</span>
        <a
          class="{btnPrimary} inline-flex h-8 min-h-8 items-center gap-1 px-2.5 text-[11px] no-underline"
          href={platformLoginHref()}
          title="前往後台登入，成功後回到此遊樂場"
        >
          登入
        </a>
      {/if}
    </div>
    <div class="playgrounds-toolbar-project">
      {#if !shellBootReady}
        <span class="text-skin-base/45 px-1 text-xs">載入中…</span>
      {:else if projects.length === 0}
        <button
          type="button"
          class="{btnPrimary} h-8 gap-1.5"
          disabled={busy}
          title="玩玩看小品，或建立沙盒"
          onclick={() => openProjectDialog()}
        >
          <PgIcon name="sparkles" size={13} />
          玩玩看
        </button>
      {:else}
      <div bind:this={projectPickerWrapEl} class="playgrounds-toolbar-picker">
        <button
          type="button"
          id="playgrounds-project-picker"
          class="{field} flex h-8 w-full items-center gap-2 text-left {!meta
            ? 'text-skin-base/45'
            : ''} {workIsActiveAgent ? 'playgrounds-picker--agent-linked' : ''}"
          aria-haspopup="listbox"
          aria-expanded={projectPickerOpen}
          aria-controls="playgrounds-project-picker-list"
          disabled={busy}
          title={meta?.name
            ? meta.source
              ? `${meta.name}（來源：${meta.source}）`
              : meta.name
            : "開啟沙盒選單；可輸入名稱 prefix 篩選"}
          onclick={toggleProjectPicker}
        >
          <span
            class="text-skin-base/45 shrink-0 {workIsActiveAgent
              ? 'text-skin-accent'
              : ''}"
            aria-hidden="true"
          >
            <PgIcon name={workIsActiveAgent ? "bot" : "folder"} size={13} />
          </span>
          <span class="min-w-0 flex-1 truncate"
            >{meta?.name ?? "選擇沙盒"}</span
          >
          {#if workIsActiveAgent}
            <span
              class="bg-skin-accent/15 text-skin-accent shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold tracking-wide"
              >總管</span
            >
          {/if}
          <span class="text-skin-base/45 shrink-0" aria-hidden="true">
            <PgIcon name={projectPickerOpen ? "chevronUp" : "chevronDown"} size={12} />
          </span>
        </button>
        {#if projectPickerOpen}
          <div
            class="playgrounds-project-picker-menu playgrounds-popover border-skin-line bg-skin-fill absolute top-[calc(100%+0.25rem)] z-30 overflow-hidden rounded-md border shadow-lg"
          >
            <div class="border-skin-line relative border-b p-1.5">
              <label class="sr-only" for="playgrounds-project-picker-filter"
                >以名稱篩選工作集</label
              >
              <span
                class="text-skin-base/40 pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
                aria-hidden="true"
              >
                <PgIcon name="search" size={12} />
              </span>
              <input
                id="playgrounds-project-picker-filter"
                bind:this={projectPickerFilterEl}
                class="{field} h-7 pl-7"
                type="search"
                autocomplete="off"
                spellcheck="false"
                placeholder="搜尋工作集…"
                disabled={busy}
                bind:value={projectPickerFilter}
                oninput={onProjectPickerFilterInput}
                onkeydown={onProjectPickerKeydown}
              />
            </div>
            <ul
              id="playgrounds-project-picker-list"
              class="max-h-56 overflow-auto py-1"
              role="listbox"
              aria-labelledby="playgrounds-project-picker"
            >
              {#if pickerProjects.length === 0}
                <li class="text-skin-base/45 px-2.5 py-2 text-xs">
                  {#if projectPickerFilter.trim()}
                    無符合「{projectPickerFilter.trim()}」的工作集沙盒
                  {:else if hiddenSandboxCount > 0}
                    工作集為空；尚有 {hiddenSandboxCount} 個未列入工作集的沙盒（選項 →
                    管理沙盒）
                  {:else}
                    尚無工作集沙盒
                  {/if}
                </li>
              {:else}
                {#each pickerProjects as p, i (p.id)}
                  <li role="option" aria-selected={p.id === activeId}>
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs {i ===
                      projectPickerIndex
                        ? 'bg-skin-accent/15 text-skin-accent'
                        : 'hover:bg-skin-card'} {p.id === activeId
                        ? 'font-semibold'
                        : ''}"
                      disabled={busy}
                      onpointerenter={() => (projectPickerIndex = i)}
                      onclick={() => void pickProject(p.id)}
                    >
                      <span
                        class="shrink-0 opacity-55 {p.id === activeAgentSandboxId
                          ? 'opacity-80'
                          : ''}"
                        aria-hidden="true"
                      >
                        <PgIcon
                          name={p.id === activeAgentSandboxId ? "bot" : "folder"}
                          size={13}
                        />
                      </span>
                      <span class="min-w-0 flex-1 truncate"
                        >{p.name}{#if p.id === activeAgentSandboxId}<span
                            class="text-skin-base/45 font-normal"
                            > · 總管</span
                          >{/if}</span
                      >
                      {#if p.id === activeId}
                        <span class="shrink-0 opacity-70" aria-hidden="true">
                          <PgIcon name="check" size={12} />
                        </span>
                      {/if}
                    </button>
                  </li>
                {/each}
              {/if}
            </ul>
          </div>
        {/if}
      </div>
      <button
        type="button"
        class="{btn} h-8 shrink-0 gap-1.5"
        disabled={busy}
        title="從小品精選一鍵開進沙盒"
        onclick={() => openProjectDialog()}
      >
        <PgIcon name="sparkles" size={13} />
        玩玩看
      </button>
      {/if}
      <div
        bind:this={actionsMenuWrapEl}
        class="playgrounds-toolbar-menu relative shrink-0"
      >
        <button
          type="button"
          id="playgrounds-actions-menu"
          class="{btn} shrink-0 gap-1.5"
          aria-haspopup="menu"
          aria-expanded={actionsMenuOpen}
          aria-controls="playgrounds-actions-menu-list"
          aria-label="遊樂場選項"
          disabled={busy}
          title="遊樂場選項"
          onclick={toggleActionsMenu}
        >
          <PgIcon name="moreHorizontal" size={13} />
          <span class="hidden sm:inline">選項</span>
          <span class="text-skin-base/45 hidden -ml-0.5 sm:inline" aria-hidden="true">
            <PgIcon name={actionsMenuOpen ? "chevronUp" : "chevronDown"} size={11} />
          </span>
        </button>
        {#if actionsMenuOpen}
          <div
            id="playgrounds-actions-menu-list"
            class="playgrounds-popover border-skin-line bg-skin-fill absolute top-[calc(100%+0.25rem)] left-0 z-30 w-max min-w-[12.5rem] max-w-[min(16rem,calc(100vw-1.5rem))] overflow-hidden rounded-md border py-1 shadow-lg"
            role="menu"
            aria-labelledby="playgrounds-actions-menu"
          >
            <div class={menuGroup} role="presentation">沙盒</div>
            <button
              type="button"
              role="menuitem"
              class={menuItem}
              disabled={busy}
              title={shortcutNewProject}
              onclick={() => runActionsMenu(openProjectDialog)}
            >
              <span class={menuIcon} aria-hidden="true"
                ><PgIcon name="folderPlus" size={13} /></span
              >
              <span class="min-w-0 flex-1">新沙盒</span>
              <kbd class={menuKbd}>{shortcutNewProject}</kbd>
            </button>
            <button
              type="button"
              role="menuitem"
              class={menuItem}
              disabled={busy || !activeId}
              onclick={() => runActionsMenu(() => void handleExport())}
              title="匯出沙盒包裹（.sam；可選含 KV／DB；不含 SecretStore）"
            >
              <span class={menuIcon} aria-hidden="true"
                ><PgIcon name="download" size={13} /></span
              >
              匯出沙盒
            </button>
            <button
              type="button"
              role="menuitem"
              class={menuItem}
              disabled={busy || !activeId}
              onclick={() => runActionsMenu(() => void handleCloneProject())}
              title="複製沙盒（可選一併複製執行期狀態）"
            >
              <span class={menuIcon} aria-hidden="true"
                ><PgIcon name="copy" size={13} /></span
              >
              複製沙盒
            </button>
            <button
              type="button"
              role="menuitem"
              class={menuItem}
              disabled={busy || !canCopyOpenLink}
              onclick={() =>
                runActionsMenu(() => void handleCopyOpenLink())
              }
              title={canCopyOpenLink
                ? canWebShare
                  ? "分享開啟連結（對方開啟後會自動匯入）"
                  : "複製開啟連結，對方開啟後會自動匯入"
                : "需有可分享來源（GitHub 或 .sam 網址）。本機範本／匯入檔無法直接產生連結"}
            >
              <span class={menuIcon} aria-hidden="true"
                ><PgIcon name="link" size={13} /></span
              >
              {canWebShare ? "分享開啟連結" : "複製開啟連結"}
            </button>
            <div
              class="border-skin-line my-1 border-t"
              role="separator"
              aria-hidden="true"
            ></div>
            <div class={menuGroup} role="presentation">總管</div>
            <button
              type="button"
              role="menuitem"
              class={menuItem}
              disabled={busy || !activeId}
              onclick={() => runActionsMenu(() => void handleSetActiveAgent())}
            >
              <span class={menuIcon} aria-hidden="true"
                ><PgIcon name="bot" size={13} /></span
              >
              設為總管
            </button>
            <div
              class="border-skin-line my-1 border-t"
              role="separator"
              aria-hidden="true"
            ></div>
            <div class={menuGroup} role="presentation">管理</div>
            <button
              type="button"
              role="menuitem"
              class={menuItem}
              disabled={busy}
              title="遊樂場密鑰庫 SecretStore（密文；env.<NAME>.get()）"
              onclick={() => runActionsMenu(() => void openSecretsDialog())}
            >
              <span class={menuIcon} aria-hidden="true"
                ><PgIcon name="key" size={13} /></span
              >
              密鑰庫
            </button>
            <button
              type="button"
              role="menuitem"
              class={menuItem}
              disabled={busy}
              title="盤點全部沙盒：工作集、可回收實例、血統"
              onclick={() => runActionsMenu(openInventoryDialog)}
            >
              <span class={menuIcon} aria-hidden="true"
                ><PgIcon name="layers" size={13} /></span
              >
              管理沙盒
            </button>
            <button
              type="button"
              role="menuitem"
              class={menuItem}
              disabled={busy}
              title="遊樂場偏好設定（存在本機瀏覽器）"
              onclick={() => runActionsMenu(openSettingsDialog)}
            >
              <span class={menuIcon} aria-hidden="true"
                ><PgIcon name="settings" size={13} /></span
              >
              設定
            </button>
            <button
              type="button"
              role="menuitem"
              class={menuItem}
              disabled={busy || !activeId}
              onclick={() => runActionsMenu(handleRenameProject)}
            >
              <span class={menuIcon} aria-hidden="true"
                ><PgIcon name="pencil" size={13} /></span
              >
              重新命名
            </button>
            <button
              type="button"
              role="menuitem"
              class={menuItemDanger}
              disabled={busy || !activeId}
              onclick={() => runActionsMenu(() => void handleDeleteProject())}
            >
              <span class="shrink-0 opacity-70" aria-hidden="true"
                ><PgIcon name="trash" size={13} /></span
              >
              刪除
            </button>
          </div>
        {/if}
      </div>
    </div>
    <div class="playgrounds-toolbar-trailing">
      <div
        class="playgrounds-toolbar-appearance"
        role="group"
        aria-label="外觀"
      >
        <div
          class="js-font-size-controls playgrounds-font-size-controls"
          role="group"
          aria-label="調整字型大小"
        >
          <button
            type="button"
            class="js-font-dec playgrounds-appearance-btn"
            title="縮小字型"
            aria-label="縮小字型"
          >
            <span
              class="playgrounds-font-label playgrounds-font-label-sm"
              aria-hidden="true">A</span
            >
          </button>
          <button
            type="button"
            class="js-font-inc playgrounds-appearance-btn"
            title="放大字型"
            aria-label="放大字型"
          >
            <span
              class="playgrounds-font-label playgrounds-font-label-lg"
              aria-hidden="true">A</span
            >
          </button>
        </div>
        <button
          type="button"
          class="js-theme-btn playgrounds-appearance-btn"
          title="切換明／暗主題"
          aria-label="切換主題"
          aria-live="polite"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="theme-icon-moon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M20.742 13.045a8.088 8.088 0 0 1-2.077.271c-2.135 0-4.14-.83-5.646-2.336a8.025 8.025 0 0 1-2.064-7.723A1 1 0 0 0 9.73 2.034a10.014 10.014 0 0 0-4.489 2.582c-3.898 3.898-3.898 10.243 0 14.143a9.937 9.937 0 0 0 7.072 2.93 9.93 9.93 0 0 0 7.07-2.929 10.007 10.007 0 0 0 2.583-4.491 1.001 1.001 0 0 0-1.224-1.224zm-2.772 4.301a7.947 7.947 0 0 1-5.656 2.343 7.953 7.953 0 0 1-5.658-2.344c-3.118-3.119-3.118-8.195 0-11.314a7.923 7.923 0 0 1 2.06-1.483 10.027 10.027 0 0 0 2.89 7.848 9.972 9.972 0 0 0 7.848 2.891 8.036 8.036 0 0 1-1.484 2.059z"
            />
          </svg>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="theme-icon-sun"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M6.993 12c0 2.761 2.246 5.007 5.007 5.007s5.007-2.246 5.007-5.007S14.761 6.993 12 6.993 6.993 9.239 6.993 12zM12 8.993c1.658 0 3.007 1.349 3.007 3.007S13.658 15.007 12 15.007 8.993 13.658 8.993 12 10.342 8.993 12 8.993zM10.998 19h2v3h-2zm0-17h2v3h-2zm-9 9h3v2h-3zm17 0h3v2h-3zM4.219 18.363l2.12-2.122 1.415 1.414-2.12 2.122zM16.24 6.344l2.122-2.122 1.414 1.414-2.122 2.122zM6.342 7.759 4.22 5.637l1.415-1.414 2.12 2.122zm13.434 10.605-1.414 1.414-2.122-2.122 1.414-1.414z"
            />
          </svg>
        </button>
      </div>
      <button
        type="button"
        class={btnIcon}
        onclick={toggleSandboxMaximize}
        title={sandboxMaximized
          ? "還原視窗（顯示網站導覽）"
          : "放大遊樂場（隱藏網站導覽）"}
        aria-label={sandboxMaximized ? "縮小遊樂場" : "放大遊樂場"}
        aria-pressed={sandboxMaximized}
        ><PgIcon
          name={sandboxMaximized ? "minimize" : "maximize"}
          size={13}
        /></button
      >
    </div>
  </header>
  {/if}

  {#if openingFromUrl}
    <div
      class="playgrounds-open-banner border-skin-line text-skin-accent border-b bg-[color-mix(in_oklab,rgb(var(--color-accent))_12%,transparent)] px-3 py-1.5"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p class="m-0 text-xs">{status}</p>
        {#if openTransferProgress?.detail}
          <p class="text-skin-base/55 m-0 font-mono text-[10px]">
            {openTransferProgress.detail}
          </p>
        {/if}
      </div>
      <div
        class="playgrounds-open-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={openTransferProgress?.ratio != null
          ? Math.round(openTransferProgress.ratio * 100)
          : undefined}
        aria-valuetext={openTransferProgress?.detail ?? "下載中"}
        aria-label="開啟進度"
      >
        {#if openTransferProgress?.ratio != null}
          <div
            class="playgrounds-open-progress-bar"
            style="width: {Math.max(2, openTransferProgress.ratio * 100)}%"
          ></div>
        {:else}
          <div
            class="playgrounds-open-progress-bar playgrounds-open-progress-bar--indeterminate"
          ></div>
        {/if}
      </div>
    </div>
  {:else if error && !projectDialogOpen}
    <p
      class="border-skin-line border-b bg-red-500/10 px-3 py-1.5 text-xs leading-relaxed text-red-700 dark:text-red-300"
      role="alert"
    >
      {error}
    </p>
  {/if}

  {#if shellBootReady && playWelcomeVisible && projects.length > 0 && !openingFromUrl}
    <div
      class="playgrounds-play-welcome border-skin-line border-b px-3 py-2"
      role="region"
      aria-label="小品推薦"
    >
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-skin-base m-0 text-xs font-semibold">
            想換口味？工具列「玩玩看」隨時可開小品
          </p>
          <p class="text-skin-base/55 m-0 mt-0.5 text-[11px] leading-snug">
            精選在下面；完整型錄見
            <button
              type="button"
              class="text-skin-accent underline decoration-dashed underline-offset-2"
              onclick={openCatalogBrowser}
            >小品</button>
            。關掉此提示後，工具列按鈕還在。
          </p>
        </div>
        <button
          type="button"
          class="{btnIcon} text-skin-base/45"
          title="關閉提示"
          aria-label="關閉提示"
          onclick={dismissPlayWelcome}
        >
          <PgIcon name="x" size={13} />
        </button>
      </div>
      <div class="playgrounds-play-welcome-chips mt-2">
        {#each playPicks.slice(0, 4) as entry (entry.repo)}
          <button
            type="button"
            class="playgrounds-play-chip"
            disabled={busy}
            title={entry.blurb}
            onclick={() => void handleOpenCatalogEntry(entry)}
          >
            <span class="playgrounds-play-chip-kind"
              >{SAM_KIND_LABEL[entry.kind]}</span
            >
            {entry.title}
          </button>
        {/each}
        <button
          type="button"
          class="playgrounds-play-chip playgrounds-play-chip--more"
          disabled={busy}
          onclick={openCatalogBrowser}
        >
          更多…
        </button>
      </div>
    </div>
  {/if}

  <div
    class="playgrounds-body flex min-h-0 flex-1 flex-col overflow-hidden {resizeEdge
      ? `playgrounds-resizing-${resizeEdge}`
      : ''}"
    style={workspaceStyle}
  >
  <div
    bind:this={workspaceEl}
    class="playgrounds-workspace min-h-0 flex-1 overflow-hidden {filesSidebarOpen
      ? ''
      : 'files-collapsed'} {previewOpen
      ? ''
      : 'preview-collapsed'} {previewMaximized
      ? 'preview-maximized'
      : ''} {editorMaximized ? 'editor-maximized' : ''} {shellBootReady &&
    projects.length === 0
      ? 'onboarding-empty'
      : ''}"
  >
    <!-- Files / Agent sidebar -->
    <aside
      class="border-skin-line flex min-h-0 flex-col overflow-hidden bg-[color-mix(in_oklab,rgb(var(--color-card))_55%,transparent)] {workIsActiveAgent
        ? 'playgrounds-sidebar--agent-linked'
        : ''}"
    >
      {#if filesSidebarOpen}
        <div
          class="border-skin-line flex h-8 shrink-0 items-center gap-0.5 border-b px-1 text-[10px] font-semibold tracking-wider uppercase"
          role="tablist"
          aria-label="沙盒、總管與線上"
        >
          <button
            type="button"
            role="tab"
            id="playgrounds-sidebar-tab-files"
            aria-selected={sidebarTab === "files"}
            aria-controls="playgrounds-files-panel"
            class="inline-flex items-center gap-1 rounded px-2 py-1 {sidebarTab ===
            'files'
              ? 'bg-skin-card text-skin-base'
              : 'text-skin-base/45 hover:text-skin-base/75'}"
            onclick={() => selectSidebarTab("files")}
          >
            <PgIcon name="files" size={12} />
            沙盒{#if sidebarTab === "files"}
              <span class="normal-case tracking-normal opacity-70"
                >{fileList.length}</span
              >
            {/if}</button
          >
          <button
            type="button"
            role="tab"
            id="playgrounds-sidebar-tab-agent"
            aria-selected={sidebarTab === "agent"}
            aria-controls="playgrounds-sidebar-agent"
            class="inline-flex items-center gap-1 rounded px-2 py-1 {sidebarTab ===
            'agent'
              ? 'bg-skin-card text-skin-base'
              : 'text-skin-base/45 hover:text-skin-base/75'}"
            onclick={() => selectSidebarTab("agent")}
          >
            <PgIcon name="bot" size={12} />
            總管
          </button>
          <button
            type="button"
            role="tab"
            id="playgrounds-sidebar-tab-avatars"
            aria-selected={sidebarTab === "avatars"}
            aria-controls="playgrounds-sidebar-avatars"
            class="inline-flex items-center gap-1 rounded px-2 py-1 {sidebarTab ===
            'avatars'
              ? 'bg-skin-card text-skin-base'
              : 'text-skin-base/45 hover:text-skin-base/75'}"
            onclick={() => selectSidebarTab("avatars")}
            title="線上（連線中的人）"
          >
            <PgIcon name="layers" size={12} />
            線上
          </button>
          <button
            type="button"
            class="{btn} ml-auto px-1.5"
            onclick={toggleFilesSidebar}
            title="縮小側欄"
            aria-expanded="true"
            aria-controls="playgrounds-files-panel"
          >
            «
          </button>
        </div>
        <div
          id="playgrounds-files-panel"
          role="tabpanel"
          aria-labelledby="playgrounds-sidebar-tab-files"
          class="flex min-h-0 flex-1 flex-col {sidebarTab === 'files'
            ? ''
            : 'hidden'}"
        >
          <div class="border-skin-line shrink-0 space-y-1.5 border-b p-2">
            <div class="flex flex-wrap gap-1">
              <button
                type="button"
                class={btnIcon}
                disabled={busy || !activeId}
                onclick={handleAddFile}
                title="新檔"
                aria-label="新檔"><PgIcon name="filePlus" /></button
              >
              <button
                type="button"
                class={btnIcon}
                disabled={busy || !activeId}
                onclick={handleAddDir}
                title="新夾"
                aria-label="新夾"><PgIcon name="folderPlus" /></button
              >
              <button
                type="button"
                class={btnIcon}
                disabled={busy || !activeId}
                onclick={triggerUpload}
                title="從作業系統上傳檔案到目前目錄"
                aria-label="上傳"><PgIcon name="upload" /></button
              >
              <button
                type="button"
                class={btnIcon}
                disabled={busy || !activeId}
                onclick={triggerUploadDir}
                title="從作業系統上傳整個目錄（含巢狀子目錄）到目前目錄"
                aria-label="上傳目錄"><PgIcon name="folderUp" /></button
              >
              <button
                type="button"
                class={btnIcon}
                disabled={busy || !activeId}
                onclick={handleFetchUrl}
                title="從 URL 下載（需 CORS）"
                aria-label="從 URL 下載"><PgIcon name="link" /></button
              >
              <button
                type="button"
                class={btnIcon}
                disabled={!activeId}
                onclick={collapseAllDirs}
                title="全部收合（保留目前檔案祖先）"
                aria-label="全部收合"><PgIcon name="listCollapse" /></button
              >
            </div>
            <label class="relative block">
              <span class="sr-only">過濾檔案</span>
              <input
                type="search"
                class="border-skin-line bg-skin-fill text-skin-base placeholder:text-skin-base/35 w-full rounded border px-2 py-1 text-[11px] font-mono"
                placeholder="過濾路徑…"
                bind:value={filesFilterQuery}
                disabled={!activeId}
              />
            </label>
            <input
              bind:this={uploadInputEl}
              type="file"
              class="hidden"
              multiple
              disabled={busy || !activeId}
              onchange={handleUploadOs}
            />
            <input
              bind:this={uploadDirInputEl}
              type="file"
              class="hidden"
              multiple
              webkitdirectory
              disabled={busy || !activeId}
              onchange={handleUploadOs}
            />
          </div>
          <div class="min-h-0 flex-1 overflow-auto p-1.5">
            {#if fileTree.length === 0 && dirs.length === 0}
              <p class="text-skin-base/45 px-1 py-2 text-[11px]">尚無檔案</p>
            {:else if filesFilterHits}
              {#if filesFilterHits.length === 0}
                <p class="text-skin-base/45 px-1 py-2 text-[11px]">無符合項目</p>
              {:else}
                <ul class="m-0 list-none space-y-px p-0 font-mono text-[11px]">
                  {#each filesFilterHits as hit (hit.kind + ":" + hit.path)}
                    {@const hitSelected = explorerSelectedPath === hit.path}
                    <li>
                      <div
                        class="hover:bg-skin-card flex w-full items-stretch rounded {hitSelected
                          ? 'bg-skin-card text-skin-accent'
                          : 'text-skin-base/85'}"
                      >
                        <button
                          type="button"
                          class="min-w-0 flex-1 truncate px-1.5 py-1 text-left"
                          title={hit.path}
                          onclick={() =>
                            hit.kind === "dir"
                              ? selectExplorerDir(hit.path)
                              : selectExplorerFile(hit.path)}
                        >
                          {hit.kind === "dir" ? `${hit.path}/` : hit.path}
                        </button>
                        {#if hitSelected}
                          <div class="flex shrink-0 items-center gap-0.5 pr-0.5">
                            <button
                              type="button"
                              class="text-skin-base/45 hover:text-skin-base inline-flex h-6 w-6 items-center justify-center rounded disabled:opacity-40"
                              disabled={busy || !activeId}
                              title={hit.kind === "dir"
                                ? "下載（資料夾打包 ZIP）"
                                : "下載"}
                              aria-label="下載"
                              onclick={() => void handleDownloadSelection()}
                              ><PgIcon name="download" size={12} /></button
                            >
                            <button
                              type="button"
                              class="text-skin-base/45 hover:text-skin-base inline-flex h-6 w-6 items-center justify-center rounded disabled:opacity-40"
                              disabled={busy}
                              title="改名"
                              aria-label="改名"
                              onclick={() => void handleRenameSelection()}
                              ><PgIcon name="pencil" size={12} /></button
                            >
                            <button
                              type="button"
                              class="text-skin-base/45 hover:text-skin-base inline-flex h-6 w-6 items-center justify-center rounded disabled:opacity-40"
                              disabled={busy}
                              title="刪除"
                              aria-label="刪除"
                              onclick={() => void handleDeleteSelection()}
                              ><PgIcon name="trash" size={12} /></button
                            >
                          </div>
                        {/if}
                      </div>
                    </li>
                  {/each}
                </ul>
              {/if}
            {:else}
              <FileExplorer
                nodes={fileTree}
                {openPath}
                selectedPath={explorerSelectedPath}
                entryPath={DEFAULT_ENTRY}
                expanded={expandedDirs}
                selectionActionsDisabled={busy || !activeId}
                onSelectFile={selectExplorerFile}
                onSelectDir={selectExplorerDir}
                onToggleDir={toggleExpandedDir}
                onDownloadSelection={() => void handleDownloadSelection()}
                onRenameSelection={() => void handleRenameSelection()}
                onDeleteSelection={() => void handleDeleteSelection()}
              />
            {/if}
          </div>
        </div>
        <div
          id="playgrounds-sidebar-agent"
          role="tabpanel"
          aria-labelledby="playgrounds-sidebar-tab-agent"
          class="bg-skin-card flex min-h-0 flex-1 flex-col {sidebarTab ===
          'agent'
            ? ''
            : 'hidden'}"
        >
          {#if !activeAgentSandboxId}
            <div
              class="text-skin-base/70 flex h-full flex-col items-start justify-center gap-3 px-4 text-[12px]"
            >
              <p class="m-0">尚未設定總管。</p>
              <p class="text-skin-base/45 m-0 text-[11px]">
                從開源小品 <code class="text-[10px]">pg-steward</code> 匯入範本並設為對口。
              </p>
              <button
                type="button"
                class="border-skin-line bg-skin-fill text-skin-base hover:bg-skin-card rounded border px-2.5 py-1 text-[11px] font-medium"
                disabled={busy}
                onclick={() => void handleInstallStewardFromCatalog()}
                >從小品匯入並設為總管</button
              >
            </div>
          {:else}
            <div
              class="border-skin-line text-skin-base/50 flex h-7 shrink-0 items-center gap-2 border-b px-2 text-[10px]"
            >
              <span
                class="min-w-0 flex-1 truncate"
                title="總管：{activeAgentLabel ?? activeAgentSandboxId}"
                >{activeAgentLabel ?? activeAgentSandboxId}</span
              >
              {#if meta?.name || activeId}
                <span
                  class="text-skin-base/35 max-w-[40%] shrink-0 truncate"
                  title="工作沙盒（總管對話與此綁定）：{meta?.name ??
                    activeId}"
                  >工作 · {meta?.name ?? activeId}</span
                >
              {/if}
              <button
                type="button"
                class={chromeIconBtn}
                disabled={busy}
                title="重新載入總管畫布"
                aria-label="重新整理"
                onclick={() => void rebuildAgentPreview()}
                ><PgIcon name="refresh" size={13} /></button
              >
              <button
                type="button"
                class={chromeIconBtn}
                disabled={busy}
                title="取消總管（不刪除沙盒，也不清除對話內容）"
                aria-label="解除總管"
                onclick={() => void handleClearActiveAgent()}
                ><PgIcon name="unlink" size={13} /></button
              >
            </div>
            {#if agentRuntimeStatus && agentRuntimeStatus.role !== "solo"}
              <div class="text-skin-base/50 px-2 py-0.5 text-[10px]">
                Agent runtime：{agentRuntimeStatus.role === "leader"
                  ? "Leader（執行 Controllers）"
                  : "外接螢幕（僅 enqueue）"}
                {#if agentRuntimeStatus.epoch > 0}
                  · epoch {agentRuntimeStatus.epoch}
                {/if}
              </div>
            {/if}
            {#if agentPreviewError}
              <div class="px-2 py-1 text-[11px] text-red-400"
                >{agentPreviewError}</div
              >
            {/if}
            <iframe
              bind:this={agentIframeEl}
              title="總管"
              class="bg-skin-fill min-h-0 w-full flex-1 border-0"
              onload={onCanvasIframeLoad}
            ></iframe>
          {/if}
        </div>
        <div
          id="playgrounds-sidebar-avatars"
          role="tabpanel"
          aria-labelledby="playgrounds-sidebar-tab-avatars"
          class="bg-skin-card flex min-h-0 flex-1 flex-col {sidebarTab ===
          'avatars'
            ? ''
            : 'hidden'}"
        >
          <AvatarsPanel />
        </div>
      {:else}
        <div class="playgrounds-files-rail">
          <button
            type="button"
            class="{btn} px-1.5"
            onclick={toggleFilesSidebar}
            title="展開側欄"
            aria-expanded="false"
            aria-controls="playgrounds-files-panel"
          >
            »
          </button>
          <button
            type="button"
            class="text-skin-base/55 hover:text-skin-base/80 px-0.5 text-[10px] font-semibold tracking-wider uppercase"
            title="展開並顯示沙盒"
            onclick={() => {
              filesSidebarOpen = true;
              selectSidebarTab("files");
            }}>沙盒</button
          >
          <button
            type="button"
            class="text-skin-base/55 hover:text-skin-base/80 px-0.5 text-[10px] font-semibold tracking-wider uppercase"
            title="展開並顯示總管"
            onclick={() => selectSidebarTab("agent")}>總管</button
          >
          <button
            type="button"
            class="text-skin-base/55 hover:text-skin-base/80 px-0.5 text-[10px] font-semibold tracking-wider uppercase"
            title="展開並顯示線上"
            onclick={() => {
              filesSidebarOpen = true;
              selectSidebarTab("avatars");
            }}>線上</button
          >
          <span class="text-skin-base/40 text-[10px]">{fileList.length}</span>
        </div>
        <!-- Keep Roster／Platform join transport mounted while rail is collapsed
             (Guest `#pg=` collapses sidebar so play surface shows first). -->
        <div hidden aria-hidden="true">
          <AvatarsPanel />
        </div>
      {/if}
    </aside>

    <div
      class="playgrounds-resizer-col"
      data-edge="files"
      role="separator"
      aria-orientation="vertical"
      aria-label="調整左側面板大小"
      onpointerdown={e => onResizePointerDown("files", e)}
      onpointermove={onResizePointerMove}
      onpointerup={onResizePointerUp}
      onpointercancel={onResizePointerUp}
    ></div>

    <!-- Editor + bottom panel -->
    <div
      bind:this={editorColEl}
      class="playgrounds-editor-pane flex min-h-0 flex-col overflow-hidden"
    >
      {#if !bottomPanelMaximized}
        <div
          class="border-skin-line flex h-8 shrink-0 items-center gap-1 border-b px-1.5 text-[11px]"
          role="tablist"
          aria-label="主內容 tabs"
        >
          {#each mainTabSummaries as tab (tab.tabId)}
            <div
              class="flex min-w-0 max-w-[10rem] items-center rounded {activeMainTabId ===
              tab.tabId
                ? 'bg-skin-card text-skin-base'
                : 'text-skin-base/45 hover:text-skin-base/75'}"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeMainTabId === tab.tabId}
                class="min-w-0 truncate px-2 py-1 text-left"
                title={tab.hasGrant ? `${tab.label}（工具）` : tab.label}
                onclick={() => void selectMainContentTab(tab.tabId)}
                >{tab.kind === "editor"
                  ? "編輯器"
                  : tab.label}{#if tab.hasGrant}<span
                    class="text-teal-700 dark:text-teal-300">·工具</span
                  >{/if}</button
              >
              {#if tab.kind === "canvas"}
                <button
                  type="button"
                  class="{btnIcon} !size-6 shrink-0"
                  title="關閉"
                  aria-label="關閉 {tab.label}"
                  onclick={() => void closeMainContentTab(tab.tabId)}
                  ><PgIcon name="x" size={12} /></button
                >
              {/if}
            </div>
          {/each}
          <button
            type="button"
            class="{btnIcon} shrink-0"
            disabled={!activeId ||
              busy ||
              toolCandidateProjects().length === 0 ||
              listCanvasTabs(mainTabs).length >= 4}
            onclick={openOpenMainCanvasDialog}
            title="開啟沙盒畫布…"
            aria-label="開啟沙盒畫布"
            >+</button
          >
          <div class="ml-auto flex items-center gap-1 px-1">
            {#if activeMainTab.kind === "editor"}
              {#if openPathBreadcrumbs.length > 0}
                <nav
                  class="text-skin-base/70 mr-1 hidden min-w-0 max-w-[12rem] items-center gap-0.5 truncate font-mono sm:flex"
                  aria-label="檔案路徑"
                >
                  {#each openPathBreadcrumbs as crumb, i (crumb.label + String(i))}
                    {#if i > 0}
                      <span class="text-skin-base/35 shrink-0">/</span>
                    {/if}
                    <span class="truncate">{crumb.label}</span>
                  {/each}
                </nav>
              {/if}
              <button
                type="button"
                class="{btnIcon}{editorToolHint
                  ? ' text-teal-700 dark:text-teal-300'
                  : ''}"
                disabled={!activeId || busy}
                onclick={() => void handleEditorToolButton()}
                title={editorToolHint
                  ? `一鍵用「${editorToolHint.meta.name}」開啟`
                  : "用工具開啟（自動建議或手動選擇）"}
                aria-label={editorToolHint
                  ? `用${editorToolHint.meta.name}開啟`
                  : "用工具開啟"}
                ><PgIcon name="sparkles" /></button
              >
              <button
                type="button"
                class={btnIcon}
                disabled={!activeId ||
                  busy ||
                  toolCandidateProjects().length === 0}
                onclick={openOpenToolDialogAsTool}
                title="選擇工具…"
                aria-label="選擇工具"
                ><PgIcon name="chevronDown" /></button
              >
            {:else if activeToolSession}
              <span class="text-skin-base/40 mr-1 hidden font-mono uppercase sm:inline"
                >{activeToolSession.grant.mode}</span
              >
            {/if}
            <button
              type="button"
              class={btnIcon}
              onclick={toggleEditorMaximize}
              title={editorMaximized
                ? "還原分割版面"
                : "全展開編輯區，佔據整個視窗"}
              aria-label={editorMaximized ? "還原編輯區" : "放大編輯區"}
              aria-pressed={editorMaximized}
              ><PgIcon
                name={editorMaximized ? "minimize" : "maximize"}
              /></button
            >
            {#if !editorMaximized}
              <button
                type="button"
                class={btnIcon}
                onclick={togglePreviewPanel}
                aria-pressed={previewOpen}
                title={previewOpen ? "隱藏畫布" : "顯示畫布"}
                aria-label={previewOpen ? "隱藏畫布" : "顯示畫布"}
                ><PgIcon name="panelRight" /></button
              >
              <button
                type="button"
                class={btnIcon}
                onclick={toggleBottomPanel}
                aria-pressed={bottomPanelOpen}
                title={bottomPanelOpen ? "隱藏面板" : "顯示面板"}
                aria-label={bottomPanelOpen ? "隱藏面板" : "顯示面板"}
                ><PgIcon name="panelBottom" /></button
              >
            {/if}
          </div>
        </div>
        <div class="relative min-h-0 flex-1">
          {#each listCanvasTabs(mainTabs) as ctab (ctab.id)}
            {@const rt = canvasRuntimeByTabId[ctab.id]}
            <div
              class="absolute inset-0 flex min-h-0 flex-col"
              class:hidden={activeMainTabId !== ctab.id}
            >
              {#if rt?.error}
                <div
                  class="text-skin-base/70 flex h-full items-center justify-center px-4 text-center text-sm"
                  role="alert"
                >
                  {rt.error}
                </div>
              {/if}
              <iframe
                title={ctab.grant
                  ? `工具：${ctab.label ?? ctab.sandboxId}`
                  : `畫布：${ctab.label ?? ctab.sandboxId}`}
                class="min-h-0 w-full flex-1 border-0 bg-white dark:bg-black"
                class:hidden={Boolean(rt?.error)}
                use:canvasIframeAction={ctab.id}
                onload={onCanvasIframeLoad}
              ></iframe>
            </div>
          {/each}
          <div
            class="absolute inset-0 flex min-h-0 flex-col"
            class:hidden={activeMainTab.kind !== "editor"}
          >
          {#if openPath && openPreviewKind && mediaPreviewUrl}
            <div
              class="bg-[color-mix(in_oklab,rgb(var(--color-fill))_88%,#888_12%)] flex h-full min-h-0 flex-col"
            >
              {#if openPreviewKind === "image"}
                <div
                  class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4"
                >
                  <img
                    src={mediaPreviewUrl}
                    alt={openPath}
                    class="max-h-full max-w-full object-contain shadow-sm"
                  />
                </div>
              {:else if openPreviewKind === "pdf"}
                <iframe
                  title={openPath}
                  src={mediaPreviewUrl}
                  class="min-h-0 w-full flex-1 border-0 bg-white"
                ></iframe>
              {:else if openPreviewKind === "audio"}
                <div
                  class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6"
                >
                  <p class="text-skin-base/70 max-w-full truncate font-mono text-sm">
                    {openPath}
                  </p>
                  <audio
                    controls
                    src={mediaPreviewUrl}
                    class="w-full max-w-lg"
                    preload="metadata"
                  >
                  </audio>
                </div>
              {:else}
                <div
                  class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4"
                >
                  <video
                    controls
                    src={mediaPreviewUrl}
                    class="max-h-full max-w-full bg-black shadow-sm"
                    preload="metadata"
                  >
                  </video>
                </div>
              {/if}
              <p
                class="text-skin-base/45 border-skin-line shrink-0 border-t px-3 py-1.5 text-center text-[11px] font-mono"
              >
                {fileContentByteLength(files[openPath] ?? new Uint8Array())} bytes ·
                {mediaPreviewCaption(openPreviewKind)}
              </p>
            </div>
          {:else if openPath && openFileIsBinary()}
            <div
              class="text-skin-base/55 flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm"
            >
              <p class="font-mono text-skin-base/80">{openPath}</p>
              <p>
                二進位檔（{fileContentByteLength(files[openPath] ?? new Uint8Array())}
                bytes），無法在編輯器開啟。檔案列表與沙盒匯出仍會保留。
              </p>
            </div>
          {:else if openPath}
            <CodeEditor
              doc={draft}
              language={editorLanguage}
              onDocChange={onDocChange}
            />
          {:else}
            <div class="playgrounds-empty-state">
              {#if projects.length !== 0}
                <div class="playgrounds-empty-state-art" aria-hidden="true">
                  <span class="playgrounds-empty-state-glow"></span>
                  <PgIcon
                    name={activeId ? "files" : "folder"}
                    size={36}
                  />
                </div>
              {/if}
              {#if !shellBootReady}
                <h3 class="playgrounds-empty-state-title">載入中…</h3>
                <p class="playgrounds-empty-state-desc">正在讀取本機沙盒</p>
              {:else if projects.length === 0}
                <div class="playgrounds-play-empty">
                  <h3 class="playgrounds-empty-state-title">先玩一款小品</h3>
                  <p class="playgrounds-empty-state-desc playgrounds-play-empty-desc">
                    點一款就會載入到這個瀏覽器——先玩玩，再改程式也行。
                  </p>
                  <SamCatalogPicksShelf
                    picks={playPicks}
                    disabled={busy}
                    showHeading={false}
                    onOpen={entry => void handleOpenCatalogEntry(entry)}
                  />
                  <div class="playgrounds-play-empty-actions">
                    <button
                      type="button"
                      class="playgrounds-play-link"
                      disabled={busy}
                      onclick={openCatalogBrowser}
                    >
                      看全部小品
                    </button>
                    <button
                      type="button"
                      class="{btn} gap-1.5"
                      disabled={busy}
                      onclick={() => openProjectDialog()}
                    >
                      <PgIcon name="folderPlus" size={13} />
                      自己從範本建
                    </button>
                  </div>
                  <p class="playgrounds-empty-state-hint">{shortcutNewProject}</p>
                </div>
              {:else if !activeId}
                <h3 class="playgrounds-empty-state-title">選擇一個沙盒</h3>
                <p class="playgrounds-empty-state-desc">
                  從上方選單開啟沙盒後即可編輯檔案。
                </p>
                <button
                  type="button"
                  class="{btn} gap-1.5"
                  disabled={busy}
                  onclick={openProjectPicker}
                >
                  <PgIcon name="folder" size={13} />
                  開啟沙盒選單
                </button>
              {:else}
                <h3 class="playgrounds-empty-state-title">尚未開啟檔案</h3>
                <p class="playgrounds-empty-state-desc">
                  從左側 Files 選一個檔案，或建立新檔開始編輯。
                </p>
              {/if}
            </div>
          {/if}
          </div>
        </div>
      {/if}
      {#if bottomPanelOpen}
        {#if !bottomPanelMaximized}
          <div
            class="playgrounds-resizer-row"
            role="separator"
            aria-orientation="horizontal"
            aria-label="調整下方面板高度"
            onpointerdown={e => onResizePointerDown("bottom", e)}
            onpointermove={onResizePointerMove}
            onpointerup={onResizePointerUp}
            onpointercancel={onResizePointerUp}
          ></div>
        {/if}
        <div
          class="border-skin-line bg-skin-card flex flex-col border-t {bottomPanelMaximized
            ? 'min-h-0 flex-1'
            : 'playgrounds-bottom-pane shrink-0'}"
        >
          <div
            class="border-skin-line flex items-center gap-1 border-b px-1.5 py-0.5"
            role="tablist"
            aria-label="下方面板"
          >
            <button
              type="button"
              role="tab"
              id="playgrounds-tab-console"
              aria-selected={bottomTab === "console"}
              aria-controls="playgrounds-panel-console"
              class="rounded px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase {bottomTab ===
              'console'
                ? 'bg-skin-fill text-skin-base'
                : 'text-skin-base/40 hover:text-skin-base/70'}"
              onclick={() => selectBottomTab("console")}>Console</button
            >
            {#each enabledBottomBuiltins as bid (bid)}
              <div
                class="flex min-w-0 items-center rounded {bottomTab === bid
                  ? 'bg-skin-fill text-skin-base'
                  : 'text-skin-base/40 hover:text-skin-base/70'}"
              >
                <button
                  type="button"
                  role="tab"
                  id="playgrounds-tab-{bid}"
                  aria-selected={bottomTab === bid}
                  aria-controls="playgrounds-panel-{bid}"
                  class="rounded px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase"
                  onclick={() => selectBottomTab(bid)}>{builtinLabel(bid)}</button
                >
                <button
                  type="button"
                  class="{chromeIconBtn} !size-5 shrink-0"
                  title="移出下方面板"
                  aria-label="移出 {builtinLabel(bid)}"
                  onclick={() => disableBottomBuiltin(bid)}
                  ><PgIcon name="x" size={11} /></button
                >
              </div>
            {/each}
            {#each bottomSamPanels as panel (panel.sandboxId)}
              {@const samTab = bottomSamTabId(panel.sandboxId)}
              <div
                class="flex min-w-0 max-w-[9rem] items-center rounded {bottomTab ===
                samTab
                  ? 'bg-skin-fill text-skin-base'
                  : 'text-skin-base/40 hover:text-skin-base/70'}"
              >
                <button
                  type="button"
                  role="tab"
                  id="playgrounds-tab-sam-{panel.sandboxId}"
                  aria-selected={bottomTab === samTab}
                  aria-controls="playgrounds-panel-sam-{panel.sandboxId}"
                  class="min-w-0 truncate px-2 py-1 text-left text-[10px] font-semibold"
                  title={panel.label ?? panel.sandboxId}
                  onclick={() => selectBottomTab(samTab)}
                  >{panel.label ?? panel.sandboxId}</button
                >
                <button
                  type="button"
                  class="{chromeIconBtn} !size-5 shrink-0"
                  title="移出下方面板"
                  aria-label="移出 {panel.label ?? panel.sandboxId}"
                  onclick={() => removeBottomSamPanel(panel.sandboxId)}
                  ><PgIcon name="x" size={11} /></button
                >
              </div>
            {/each}
            <button
              type="button"
              class="{chromeIconBtn} shrink-0"
              title="加入輔助面板…"
              aria-label="加入輔助面板"
              onclick={openAddBottomPanelDialog}>+</button
            >
            <div class="ml-auto flex items-center gap-1 px-1">
              {#if bottomTab === "console"}
                <span
                  class="text-skin-base/35 mr-0.5 hidden font-mono text-[10px] tabular-nums sm:inline"
                  title="顯示／總筆數（最多保留 300）"
                  >{filteredConsoleLines.length}/{consoleLines.length}</span
                >
                <button
                  type="button"
                  class={chromeIconBtn}
                  title="複製目前篩選結果"
                  aria-label="複製 Console"
                  onclick={() => void copyFilteredConsole()}
                  ><PgIcon name="copy" size={13} /></button
                >
                <button
                  type="button"
                  class={chromeIconBtn}
                  title={consoleScrollLocked
                    ? "繼續自動捲到底"
                    : "暫停自動捲動（已跟到底）"}
                  aria-label={consoleScrollLocked
                    ? "繼續自動捲動"
                    : "暫停自動捲動"}
                  aria-pressed={consoleScrollLocked}
                  onclick={() => {
                    if (consoleScrollLocked) scrollConsoleToBottom();
                    else consoleScrollLocked = true;
                  }}
                  ><PgIcon
                    name={consoleScrollLocked ? "play" : "pause"}
                    size={13}
                  /></button
                >
                <button
                  type="button"
                  class={chromeIconBtn}
                  title="清除 Console"
                  aria-label="清除 Console"
                  onclick={() => {
                    consoleLines = [];
                    clearWorkConsoleBuffer();
                    previewError = null;
                    consoleScrollLocked = false;
                  }}><PgIcon name="trash" size={13} /></button
                >
              {/if}
              <button
                type="button"
                class={chromeIconBtn}
                onclick={toggleBottomPanelMaximize}
                title={bottomPanelMaximized
                  ? "還原面板高度並顯示 Editor"
                  : "放大面板並隱藏 Editor"}
                aria-label={bottomPanelMaximized ? "還原面板" : "放大面板"}
                aria-pressed={bottomPanelMaximized}
                ><PgIcon
                  name={bottomPanelMaximized ? "minimize" : "maximize"}
                  size={13}
                /></button
              >
              {#if !bottomPanelMaximized}
                <button
                  type="button"
                  class={chromeIconBtn}
                  title="隱藏面板"
                  aria-label="隱藏面板"
                  onclick={toggleBottomPanel}
                  ><PgIcon name="panelClose" size={13} /></button
                >
              {/if}
            </div>
          </div>
          <div class="min-h-0 flex-1 overflow-hidden">
            <div
              id="playgrounds-panel-console"
              role="tabpanel"
              aria-labelledby="playgrounds-tab-console"
              class="bg-skin-fill flex h-full min-h-0 flex-col {bottomTab ===
              'console'
                ? ''
                : 'hidden'}"
            >
              <div
                class="border-skin-line flex shrink-0 flex-wrap items-center gap-1.5 border-b px-2 py-1.5"
              >
                <div
                  class="flex flex-wrap items-center gap-0.5"
                  role="group"
                  aria-label="等級篩選"
                >
                  {#each CONSOLE_LEVEL_FILTERS as level}
                    <button
                      type="button"
                      class="rounded px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase {consoleLevelFilter ===
                      level
                        ? level === 'error'
                          ? 'bg-red-600/15 text-red-700 dark:text-red-300'
                          : level === 'warn'
                            ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
                            : 'bg-skin-card text-skin-base'
                        : 'text-skin-base/40 hover:text-skin-base/70'}"
                      aria-pressed={consoleLevelFilter === level}
                      onclick={() => {
                        consoleLevelFilter = level;
                      }}>{level === "all" ? "全部" : level}</button
                    >
                  {/each}
                </div>
                <label class="relative ml-auto min-w-[8rem] flex-1 max-w-xs">
                  <span class="sr-only">搜尋 Console</span>
                  <span
                    class="text-skin-base/35 pointer-events-none absolute top-1/2 left-1.5 -translate-y-1/2"
                    aria-hidden="true"
                    ><PgIcon name="search" size={11} /></span
                  >
                  <input
                    type="search"
                    class="border-skin-line bg-skin-fill focus:border-skin-accent w-full rounded border py-0.5 pr-2 pl-6 font-mono text-[11px] outline-none"
                    placeholder="篩選…"
                    bind:value={consoleQuery}
                  />
                </label>
              </div>
              <div
                bind:this={consoleListEl}
                class="min-h-0 flex-1 overflow-auto px-2.5 py-2 font-mono text-[11px] leading-relaxed"
                onscroll={onConsoleListScroll}
              >
                {#if previewError}
                  <div
                    class="mb-1.5 rounded border border-red-600/30 bg-red-600/10 px-2 py-1 text-red-700 dark:text-red-300"
                    >{previewError}</div
                  >
                {/if}
                {#each filteredConsoleLines as line, i (line.at + ":" + i + ":" + line.text)}
                  <div
                    class="flex gap-2 {line.level === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : line.level === 'warn'
                        ? 'text-amber-700 dark:text-amber-300'
                        : line.level === 'info'
                          ? 'text-sky-800 dark:text-sky-300'
                          : line.level === 'debug'
                            ? 'text-skin-base/45'
                            : 'text-skin-base/70'}"
                  >
                    <span
                      class="text-skin-base/30 shrink-0 tabular-nums"
                      title={new Date(line.at).toLocaleString()}
                      >{formatConsoleTime(line.at)}</span
                    >
                    <span class="text-skin-base/35 w-12 shrink-0 uppercase"
                      >{line.level}</span
                    >
                    <span class="min-w-0 flex-1 whitespace-pre-wrap break-words"
                      >{line.text}</span
                    >
                  </div>
                {/each}
                {#if !previewError && consoleLines.length === 0}
                  <div class="text-skin-base/30 space-y-1">
                    <div>工作沙盒畫布 runtime 輸出會出現在這裡。</div>
                    <div class="text-[10px]"
                      >預設不寫入瀏覽器 DevTools；可在「選項 → 設定」開啟鏡像。</div
                    >
                  </div>
                {:else if consoleLines.length > 0 && filteredConsoleLines.length === 0}
                  <div class="text-skin-base/30"
                    >沒有符合目前篩選的輸出</div
                  >
                {/if}
              </div>
            </div>
            {#if pythonMounted}
              <div
                id="playgrounds-panel-python"
                role="tabpanel"
                aria-labelledby="playgrounds-tab-python"
                class="h-full {bottomTab === 'python' ? '' : 'hidden'}"
              >
                <PlaygroundsPythonRepl
                  files={files}
                  projectId={activeId}
                  disabled={!activeId}
                  visible={bottomPanelOpen && bottomTab === "python"}
                  onPathsChanged={async ({ changed }) => {
                    if (!activeId) return;
                    let next = { ...files };
                    for (const path of changed) {
                      const content = await loadFile(activeId, path);
                      if (content !== undefined) next[path] = content;
                    }
                    files = next;
                    if (openPath && openPath in next && isTextContent(next[openPath]!)) {
                      const text = next[openPath];
                      draft = typeof text === "string" ? text : draft;
                    }
                    meta = await readMeta(activeId);
                    schedulePreview(true);
                  }}
                  onStatus={d => {
                    if (d) status = d;
                  }}
                />
              </div>
            {/if}
            {#if javascriptMounted}
              <div
                id="playgrounds-panel-javascript"
                role="tabpanel"
                aria-labelledby="playgrounds-tab-javascript"
                class="h-full {bottomTab === 'javascript' ? '' : 'hidden'}"
              >
                <PlaygroundsJsRepl
                  files={files}
                  projectId={activeId}
                  disabled={!activeId}
                  visible={bottomPanelOpen && bottomTab === "javascript"}
                  onStatus={d => {
                    if (d) status = d;
                  }}
                />
              </div>
            {/if}
            {#if shellMounted}
              <div
                id="playgrounds-panel-shell"
                role="tabpanel"
                aria-labelledby="playgrounds-tab-shell"
                class="h-full {bottomTab === 'shell' ? '' : 'hidden'}"
              >
                <PlaygroundsShell
                  files={files}
                  projectId={activeId}
                  projectName={meta?.name ?? "project"}
                  disabled={!activeId}
                  visible={bottomPanelOpen && bottomTab === "shell"}
                  onWriteFiles={async writes => {
                    if (!activeId) return;
                    for (const [path, content] of Object.entries(writes)) {
                      files = { ...files, [path]: content };
                      meta = await saveFile(activeId, path, content);
                    }
                    schedulePreview(true);
                  }}
                  onPathsChanged={async ({ changed, deleted }) => {
                    if (!activeId) return {};
                    let next = { ...files };
                    const reloaded: Record<string, (typeof files)[string]> = {};
                    for (const path of deleted) {
                      delete next[path];
                    }
                    for (const path of changed) {
                      const content = await loadFile(activeId, path);
                      if (content !== undefined) {
                        next[path] = content;
                        reloaded[path] = content;
                      } else delete next[path];
                    }
                    files = next;
                    if (openPath && !(openPath in files)) {
                      openPath = null;
                      draft = "";
                    } else if (openPath && isTextContent(files[openPath])) {
                      const text = files[openPath];
                      draft = typeof text === "string" ? text : draft;
                    }
                    meta = await readMeta(activeId);
                    schedulePreview(true);
                    return reloaded;
                  }}
                  onStatus={d => {
                    if (d) status = d;
                  }}
                />
              </div>
            {/if}
            {#each bottomSamPanels as panel (panel.sandboxId)}
              {@const samTab = bottomSamTabId(panel.sandboxId)}
              {#if bottomTab === samTab}
                {@const rt = bottomSamRuntimeById[panel.sandboxId]}
                <div
                  id="playgrounds-panel-sam-{panel.sandboxId}"
                  role="tabpanel"
                  aria-labelledby="playgrounds-tab-sam-{panel.sandboxId}"
                  class="flex h-full min-h-0 flex-col"
                >
                  {#if rt?.error}
                    <div
                      class="text-skin-base/70 flex h-full items-center justify-center px-4 text-center text-sm"
                      role="alert"
                    >
                      {rt.error}
                    </div>
                  {/if}
                  <iframe
                    title="下方：{panel.label ?? panel.sandboxId}"
                    class="min-h-0 w-full flex-1 border-0 bg-white dark:bg-black"
                    class:hidden={Boolean(rt?.error)}
                    use:bottomSamIframeAction={panel.sandboxId}
                    onload={() => {
                      const el = bottomSamIframeById.get(panel.sandboxId);
                      if (el) {
                        armCanvasConsoleGate(
                          el,
                          shellPrefs.mirrorConsoleToBrowser
                        );
                      }
                    }}
                  ></iframe>
                </div>
              {/if}
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <div
      class="playgrounds-resizer-col"
      data-edge="preview"
      role="separator"
      aria-orientation="vertical"
      aria-label="調整編輯器與畫布大小"
      onpointerdown={e => onResizePointerDown("preview", e)}
      onpointermove={onResizePointerMove}
      onpointerup={onResizePointerUp}
      onpointercancel={onResizePointerUp}
    ></div>

    <!-- 畫布（程式渲染結果／runtime） -->
    <div class="playgrounds-preview-pane flex min-h-0 flex-col overflow-hidden">
      <div class="bg-skin-card flex min-h-0 flex-1 flex-col">
        {#if invitePlaySession && previewMaximized}
          <!-- Consumer invite: no IDE chrome; join modal owns status. -->
        {:else}
        <div
          class="border-skin-line flex h-8 shrink-0 items-center gap-1.5 border-b px-2.5"
        >
          <span class="size-2 rounded-full bg-[#ff5f57]" aria-hidden="true"
          ></span>
          <span class="size-2 rounded-full bg-[#febc2e]" aria-hidden="true"
          ></span>
          <span class="size-2 rounded-full bg-[#28c840]" aria-hidden="true"
          ></span>
          <span
            class="bg-skin-fill/80 text-skin-base/70 ml-1 min-w-0 truncate rounded px-2 py-0.5 text-[10px]"
            title={canvasDocTitle
              ? `${canvasDocTitle} · ${DEFAULT_ENTRY}`
              : DEFAULT_ENTRY}>{canvasTitleLabel}</span
          >
          <div class="ml-auto flex items-center gap-1">
            <button
              type="button"
              class={chromeIconBtn}
              disabled={busy || !activeId}
              onclick={showAndRebuildPreview}
              title="重新整理畫布（⌘/Ctrl+Enter）"
              aria-label="重新整理畫布"
              ><PgIcon name="refresh" size={13} /></button
            >
            {#if tryPlaySession && previewMaximized}
              <button
                type="button"
                class={chromeTextBtnAccent}
                disabled={busy || openingFromUrl}
                onclick={() => void handleTryPlayRandom()}
                title="隨機換一款小品，維持畫布最大化"
                aria-label="換一個小品"
                >換一個</button
              >
              <button
                type="button"
                class={chromeTextBtnAccent}
                disabled={busy || openingFromUrl}
                onclick={openCatalogBrowser}
                title="開啟型錄（畫布維持最大化）"
                aria-label="開啟小品型錄"
                >型錄</button
              >
              <button
                type="button"
                class={chromeTextBtn}
                disabled={busy}
                onclick={exitTryPlayToWorkspace}
                title="顯示編輯器與檔案（離開試玩畫布）"
                aria-label="看原始碼"
                >看原始碼</button
              >
            {:else}
              <button
                type="button"
                class={chromeIconBtn}
                onclick={togglePreviewMaximize}
                title={previewMaximized
                  ? "還原分割版面"
                  : "全展開畫布，佔據整個視窗"}
                aria-label={previewMaximized ? "還原畫布" : "放大畫布"}
                aria-pressed={previewMaximized}
                ><PgIcon
                  name={previewMaximized ? "minimize" : "maximize"}
                  size={13}
                /></button
              >
              {#if !previewMaximized}
                <button
                  type="button"
                  class={chromeIconBtn}
                  onclick={togglePreviewPanel}
                  title="隱藏畫布"
                  aria-label="隱藏畫布"
                  ><PgIcon name="panelClose" size={13} /></button
                >
              {/if}
            {/if}
          </div>
        </div>
        {/if}
        <div class="playgrounds-preview-frame flex min-h-0 flex-1 flex-col">
          <iframe
            bind:this={iframeEl}
            class="min-h-0 w-full flex-1 border-0 bg-transparent"
            title={canvasTitleLabel}
            onload={onCanvasIframeLoad}
          ></iframe>
        </div>
      </div>
    </div>
  </div>
  </div>

  {#if !previewMaximized && !editorMaximized}
  <div
    class="playgrounds-statusbar border-skin-line text-skin-base/55 flex h-7 shrink-0 items-center gap-3 border-t px-3 font-mono text-[10px]"
  >
    <span
      class={saveState === "dirty"
        ? "text-amber-600 dark:text-amber-400"
        : saveState === "saved"
          ? "text-skin-accent"
          : ""}>{saveLabel}</span
    >
    <span class="text-skin-base/30">·</span>
    <span class="truncate">{status}</span>
    {#if multiAgentSession}
      <span
        class="text-skin-accent"
        title="{multiAgentSession.protocol.protocolId} · {multiAgentSession.channelName}"
        >通道 {multiAgentSession.status} · {multiAgentSession.seats.length} 座</span
      >
    {/if}
    <div
      class="text-skin-base/30 ml-auto flex shrink-0 items-center gap-3"
    >
      <span class="hidden sm:inline"
        >{shortcutMod}+S 儲存 · {shortcutMod}+Enter 畫布 · {shortcutNewProject} 新沙盒</span
      >
      {#if builtAtLabel}
        <span
          class="tabular-nums"
          title="Playgrounds 建置時間（版本識別）· {PLAYGROUNDS_BUILT_AT}"
          >建置 {builtAtLabel}</span
        >
      {/if}
    </div>
  </div>
  {/if}
  <!-- Background Participant Agent canvases (DEC-023); not visible chrome. -->
  <div class="sr-only" aria-hidden="true">
    {#each participantIframes as p (p.seatId)}
      <iframe
        title="session-seat-{p.seatId}"
        class="h-0 w-0 border-0"
        onload={onCanvasIframeLoad}
        {@attach (el: HTMLIFrameElement) => {
          participantIframeEls.set(p.seatId, el);
          if (!participantMountStarted.has(p.seatId)) {
            participantMountStarted.add(p.seatId);
            void rebuildParticipantPreview(p.seatId, p.sandboxId);
          }
          return () => {
            participantIframeEls.delete(p.seatId);
          };
        }}
      ></iframe>
    {/each}
  </div>
</div>

<dialog
  bind:this={dialogEl}
  class="playgrounds-project-dialog playgrounds-dialog border-skin-line bg-skin-fill text-skin-base m-auto w-[min(34rem,calc(100%-2rem))] max-h-[min(38rem,calc(100%-2rem))] rounded-xl border p-0 shadow-2xl backdrop:bg-black/55"
  onclose={onDialogClose}
>
  <div class="flex max-h-[min(38rem,calc(100dvh-2rem))] flex-col">
    <div class="playgrounds-dialog-head">
      <div class="playgrounds-dialog-title-row">
        <span class="playgrounds-dialog-icon" aria-hidden="true">
          <PgIcon name="folderPlus" size={16} />
        </span>
        <div class="min-w-0">
          <h2 class="text-sm font-semibold">新沙盒</h2>
          <p class="text-skin-base/55 mt-0.5 text-[11px]">
            先挑小品玩玩，或用內建範本／匯入／GitHub／網址建立
          </p>
        </div>
      </div>
      <button
        type="button"
        class="{btnIcon} text-skin-base/55"
        onclick={closeProjectDialog}
        aria-label="關閉"
        title="關閉"
      >
        <PgIcon name="x" size={14} />
      </button>
    </div>

    <div class="min-h-0 flex-1 space-y-5 overflow-auto px-4 py-3">
      {#if error && projectDialogOpen}
        <p class="text-xs text-red-700 dark:text-red-300" role="alert">{error}</p>
      {/if}

      <div class="space-y-2">
        <p class="playgrounds-dialog-section">
          <PgIcon name="sparkles" size={11} />
          玩玩看（小品）
        </p>
        <p class="text-skin-base/50 m-0 text-[11px] leading-relaxed">
          精選一鍵開進沙盒；或
          <button
            type="button"
            class="text-skin-accent underline decoration-dashed underline-offset-2"
            onclick={openCatalogBrowser}
          >搜尋全庫</button>
          （同型錄元件，不離開本場）。可分享頁見
          <a
            class="text-skin-accent underline decoration-dashed underline-offset-2"
            href="/sam/"
            onclick={closeProjectDialog}>/sam/</a
          >。
        </p>
        <SamCatalogPicksShelf
          picks={playPicks}
          dense
          showHeading={false}
          disabled={busy}
          onOpen={entry => void handleOpenCatalogEntry(entry)}
        />
      </div>

      <div class="space-y-2">
        <p class="playgrounds-dialog-section">
          <PgIcon name="folderPlus" size={11} />
          從範本建立
        </p>
        <fieldset class="m-0 min-w-0 border-0 p-0" disabled={busy}>
          <legend class="sr-only">沙盒範本</legend>
          <div
            class="border-skin-line divide-skin-line divide-y overflow-hidden rounded-md border"
            role="radiogroup"
            aria-label="沙盒範本"
          >
            {#each PROJECT_TEMPLATES as t (t.id)}
              <label
                class="hover:bg-skin-card flex cursor-pointer items-start gap-2.5 px-2.5 py-2 text-xs {newProjectTemplate ===
                t.id
                  ? 'bg-skin-accent/10'
                  : ''}"
              >
                <input
                  type="radio"
                  class="mt-0.5"
                  name="playgrounds-new-project-template"
                  value={t.id}
                  checked={newProjectTemplate === t.id}
                  onchange={() => selectNewProjectTemplate(t.id)}
                />
                <span class="min-w-0">
                  <span class="text-skin-base font-medium">{t.label}</span>
                  <span class="text-skin-base/50 block text-[11px] leading-snug"
                    >{t.hint}</span
                  >
                </span>
              </label>
            {/each}
          </div>
        </fieldset>
        <div class="flex flex-wrap gap-2">
          <input
            class="{field} min-w-[12rem] flex-1"
            bind:value={newProjectName}
            placeholder="沙盒名稱（可留空用範本預設）"
            disabled={busy}
          />
          <button
            type="button"
            class="{btnPrimary} gap-1.5"
            disabled={busy}
            onclick={() => void handleCreateFromTemplate()}
          >
            <PgIcon name="folderPlus" size={13} />
            以範本建立
          </button>
        </div>
      </div>

      <div class="space-y-2">
        <p class="playgrounds-dialog-section">
          <PgIcon name="upload" size={11} />
          匯入沙盒
        </p>
        <p class="text-skin-base/50 m-0 text-[11px] leading-relaxed">
          上方「沙盒名稱」有填則優先使用；否則用目錄名或 .sam 內名稱。
        </p>
        <div class="flex flex-wrap gap-2">
          <label
            class="{btn} inline-flex cursor-pointer gap-1.5"
            title="選擇 .sam 沙盒包裹"
          >
            <PgIcon name="upload" size={13} />
            選擇 .sam
            <input
              type="file"
              accept=".sam"
              class="hidden"
              onchange={handleImport}
              disabled={busy}
            />
          </label>
          <label
            class="{btn} inline-flex cursor-pointer gap-1.5"
            title="選擇本機目錄（含巢狀子目錄）建立新沙盒"
          >
            <PgIcon name="folderUp" size={13} />
            上傳目錄
            <input
              type="file"
              class="hidden"
              multiple
              webkitdirectory
              onchange={handleImportDirectoryAsProject}
              disabled={busy}
            />
          </label>
        </div>
      </div>

      <div class="space-y-2">
        <p class="playgrounds-dialog-section">
          <PgIcon name="github" size={11} />
          自 GitHub 複製
        </p>
        <p class="text-skin-base/50 m-0 text-[11px] leading-relaxed">
          僅公開儲存庫；走 GitHub API，可能受頻率限制。
        </p>
        <input
          class={field}
          bind:value={githubUrl}
          placeholder="owner/repo 或 https://github.com/…/tree/…"
          disabled={busy}
        />
        <button
          type="button"
          class="{btnPrimary} gap-1.5"
          disabled={busy || !githubUrl.trim()}
          onclick={handleCloneGithub}
        >
          <PgIcon name="download" size={13} />
          複製到 OPFS
        </button>
      </div>

      <div class="space-y-2">
        <p class="playgrounds-dialog-section">
          <PgIcon name="link" size={11} />
          從網址開啟／分享
        </p>
        <p class="text-skin-base/50 m-0 text-[11px] leading-relaxed">
          貼上 .sam 網址、GitHub 或 GitLab。「立即開啟」等同
          <code class="text-[10px]">?open=</code>；相同來源若本機已安裝會詢問取代或保留（另建新沙盒）。可加
          <code class="text-[10px]">as=agent|tool</code>、
          <code class="text-[10px]">fresh=1</code>（略過詢問、強制新建）。
        </p>
        <input
          class={field}
          bind:value={openShareSource}
          placeholder=".sam 網址、owner/repo、GitHub 或 GitLab URL"
          disabled={busy}
        />
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="{btnPrimary} gap-1.5"
            disabled={busy || !canOpenShareSource}
            onclick={() => void handleOpenShareSource()}
          >
            <PgIcon name="download" size={13} />
            立即開啟
          </button>
          <button
            type="button"
            class="{btn} gap-1.5"
            disabled={busy || !canOpenShareSource}
            onclick={() => void handleCopyOpenLink(openShareSource)}
            title={canWebShare
              ? "分享開啟連結"
              : "複製開啟連結到剪貼簿"}
          >
            <PgIcon name="link" size={13} />
            {canWebShare ? "分享開啟連結" : "複製開啟連結"}
          </button>
        </div>
      </div>
    </div>
  </div>
</dialog>

<dialog
  bind:this={catalogBrowserEl}
  class="playgrounds-catalog-dialog playgrounds-dialog border-skin-line bg-skin-fill text-skin-base m-auto w-[min(72rem,calc(100%-1.25rem))] max-h-[min(52rem,calc(100%-1.25rem))] rounded-xl border p-0 shadow-2xl backdrop:bg-black/55"
  onclose={onCatalogBrowserClose}
>
  <div class="flex max-h-[min(52rem,calc(100dvh-1.25rem))] flex-col">
    <div class="playgrounds-dialog-head">
      <div class="playgrounds-dialog-title-row">
        <span class="playgrounds-dialog-icon" aria-hidden="true">
          <PgIcon name="sparkles" size={16} />
        </span>
        <div class="min-w-0">
          <h2 class="text-sm font-semibold">小品型錄</h2>
          <p class="text-skin-base/55 mt-0.5 text-[11px]">
            搜尋／篩選全庫，一鍵開進本場 · 可分享頁
            <a
              class="text-skin-accent underline decoration-dashed underline-offset-2"
              href="/sam/"
              onclick={closeCatalogBrowser}>/sam/</a
            >
          </p>
        </div>
      </div>
      <button
        type="button"
        class="{btnIcon} text-skin-base/55"
        onclick={closeCatalogBrowser}
        aria-label="關閉"
        title="關閉"
      >
        <PgIcon name="x" size={14} />
      </button>
    </div>
    <div class="min-h-0 flex-1 overflow-auto">
      {#if catalogBrowserOpen}
        <SamCatalogBrowser
          variant="panel"
          syncUrl={false}
          showHero={false}
          showFootnote={false}
          showPicks={true}
          autofocusSearch={true}
          disabled={busy}
          onOpen={entry => void handleOpenCatalogEntry(entry)}
        />
      {/if}
    </div>
  </div>
</dialog>

<dialog
  bind:this={addBottomPanelDialogEl}
  class="playgrounds-dialog border-skin-line bg-skin-fill text-skin-base m-auto w-[min(26rem,calc(100%-2rem))] max-h-[min(32rem,calc(100%-2rem))] rounded-xl border p-0 shadow-2xl backdrop:bg-black/55"
  onclose={() => {
    addBottomPanelDialogOpen = false;
  }}
>
  <div class="playgrounds-dialog-head">
    <div class="playgrounds-dialog-title-row">
      <span class="playgrounds-dialog-icon" aria-hidden="true">
        <PgIcon name="panelBottom" size={16} />
      </span>
      <div class="min-w-0">
        <h2 class="text-sm font-semibold">加入輔助面板</h2>
        <p class="text-skin-base/55 mt-0.5 text-[11px]">
          下方面板 · 預設不啟動 Worker／畫布
        </p>
      </div>
    </div>
    <button
      type="button"
      class="{btnIcon} text-skin-base/55"
      onclick={closeAddBottomPanelDialog}
      aria-label="關閉"
      title="關閉"
    >
      <PgIcon name="x" size={14} />
    </button>
  </div>
  <div class="space-y-3 px-4 py-3 text-sm">
    {#if addBottomPanelDialogOpen}
      <fieldset class="m-0 border-0 p-0">
        <legend class="text-xs">內建</legend>
        <div class="mt-1 flex flex-wrap gap-1.5">
          {#each BOTTOM_BUILTINS as bid}
            {@const on = enabledBottomBuiltins.includes(bid)}
            <button
              type="button"
              class="rounded border px-2.5 py-1 text-[11px] font-semibold {on
                ? 'border-skin-line bg-skin-card text-skin-base/45'
                : 'border-skin-line text-skin-base hover:bg-skin-card'}"
              disabled={busy || on}
              onclick={() => enableBottomBuiltin(bid)}
              >{builtinLabel(bid)}{on ? " · 已加入" : ""}</button
            >
          {/each}
        </div>
      </fieldset>
      <fieldset class="m-0 border-0 p-0">
        <legend class="text-xs"
          >自選 SAM（plain · 最多 {MAX_BOTTOM_SAM}）</legend
        >
        {#if true}
          {@const candidates = bottomDockCandidateProjects()}
          <ul
            class="border-skin-line mt-1 max-h-40 space-y-1 overflow-auto rounded-md border p-1.5"
            role="listbox"
            aria-label="可掛到下方的沙盒"
          >
            {#if !activeId}
              <p class="text-skin-base/50 px-1 py-2 text-[11px]"
                >請先開啟工作沙盒。</p
              >
            {:else if candidates.length === 0}
              <p class="text-skin-base/50 px-1 py-2 text-[11px]">
                {bottomSamPanels.length >= MAX_BOTTOM_SAM
                  ? `下方已滿 ${MAX_BOTTOM_SAM} 個 SAM。`
                  : "沒有可加入的沙盒（排除工作沙盒、總管、已掛主內容／下方者）。"}
              </p>
            {:else}
              {#each candidates as p}
                <li>
                  <label
                    class="hover:bg-skin-card flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs {addBottomSamPickId ===
                    p.id
                      ? 'bg-skin-card'
                      : ''}"
                  >
                    <input
                      type="radio"
                      name="add-bottom-sam"
                      class="mt-0.5"
                      value={p.id}
                      checked={addBottomSamPickId === p.id}
                      onchange={() => {
                        addBottomSamPickId = p.id;
                      }}
                      disabled={busy}
                    />
                    <span class="min-w-0 truncate font-medium">{p.name}</span>
                  </label>
                </li>
              {/each}
            {/if}
          </ul>
        {/if}
        <div class="mt-2 flex justify-end">
          <button
            type="button"
            class="{btnPrimary} gap-1.5"
            disabled={busy ||
              !addBottomSamPickId ||
              bottomSamPanels.length >= MAX_BOTTOM_SAM}
            onclick={() => void addBottomSamPanel(addBottomSamPickId)}
          >
            加入下方
          </button>
        </div>
      </fieldset>
    {/if}
  </div>
</dialog>

<dialog
  bind:this={openToolDialogEl}
  class="playgrounds-dialog border-skin-line bg-skin-fill text-skin-base m-auto w-[min(26rem,calc(100%-2rem))] max-h-[min(32rem,calc(100%-2rem))] rounded-xl border p-0 shadow-2xl backdrop:bg-black/55"
  onclose={() => {
    openToolDialogOpen = false;
  }}
>
  <div class="playgrounds-dialog-head">
    <div class="playgrounds-dialog-title-row">
      <span class="playgrounds-dialog-icon" aria-hidden="true">
        <PgIcon name="sparkles" size={16} />
      </span>
      <div class="min-w-0">
        <h2 class="text-sm font-semibold">開啟沙盒畫布</h2>
        <p class="text-skin-base/55 mt-0.5 text-[11px]">
          掛到主內容 tab · 不切換工作沙盒
        </p>
      </div>
    </div>
    <button
      type="button"
      class="{btnIcon} text-skin-base/55"
      onclick={closeOpenToolDialog}
      aria-label="關閉"
      title="關閉"
    >
      <PgIcon name="x" size={14} />
    </button>
  </div>
  <div class="space-y-3 px-4 py-3 text-sm">
    <p class="text-skin-base/60 m-0 text-xs leading-relaxed">
      預設只顯示畫布；勾選「作為工具」才授權讀寫工作區路徑。
    </p>
    {#if openToolDialogOpen}
      {@const ranked = rankedToolCandidates(openToolPath || openPath || "")}
      <label class="inline-flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          bind:checked={openMainAsTool}
          disabled={busy}
        />
        作為工具（授權工作區檔案）
      </label>
      {#if openMainAsTool}
        <label class="block text-xs" for="playgrounds-open-tool-path"
          >授權路徑（檔案或目錄）</label
        >
        <input
          id="playgrounds-open-tool-path"
          class={field}
          bind:value={openToolPath}
          placeholder="例如 README.md 或 docs"
          disabled={busy}
          autocomplete="off"
          oninput={() => syncOpenToolSelectionFromPath()}
        />
      {/if}
      <fieldset class="m-0 border-0 p-0">
        <legend class="text-xs">沙盒</legend>
        <ul
          class="border-skin-line mt-1 max-h-40 space-y-1 overflow-auto rounded-md border p-1.5"
          role="listbox"
          aria-label="建議工具"
        >
          {#if ranked.length === 0}
            <p class="text-skin-base/50 px-1 py-2 text-[11px]">
              沒有其他沙盒可掛載。請先「新沙盒」用工具範本建立。
            </p>
          {:else}
            {#each ranked as row, i}
              <li>
                <label
                  class="hover:bg-skin-card flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs {openToolSandboxId ===
                  row.meta.id
                    ? 'bg-skin-card'
                    : ''}"
                >
                  <input
                    type="radio"
                    name="open-tool-project"
                    class="mt-0.5"
                    value={row.meta.id}
                    checked={openToolSandboxId === row.meta.id}
                    onchange={() => {
                      openToolSandboxId = row.meta.id;
                    }}
                    disabled={busy}
                  />
                  <span class="min-w-0 flex-1">
                    <span class="flex flex-wrap items-center gap-1.5">
                      <span class="font-medium">{row.meta.name}</span>
                      {#if i === 0 && row.score >= 30}
                        <span
                          class="rounded bg-teal-700/15 px-1 py-px text-[10px] text-teal-800 dark:text-teal-300"
                          >建議</span
                        >
                      {/if}
                    </span>
                    {#if row.reasons.length}
                      <span class="text-skin-base/45 block text-[10px]">
                        {row.reasons.join(" · ")}
                      </span>
                    {:else}
                      <span class="text-skin-base/35 block text-[10px]"
                        >一般沙盒（未標示工具類型）</span
                      >
                    {/if}
                  </span>
                </label>
              </li>
            {/each}
          {/if}
        </ul>
      </fieldset>
      {#if openMainAsTool}
        <fieldset class="m-0 border-0 p-0">
          <legend class="text-xs">權限</legend>
          <div class="mt-1 flex gap-3 text-xs">
            <label class="inline-flex items-center gap-1.5">
              <input
                type="radio"
                name="open-tool-mode"
                value="read"
                checked={openToolMode === "read"}
                onchange={() => {
                  openToolMode = "read";
                }}
                disabled={busy}
              />
              唯讀
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input
                type="radio"
                name="open-tool-mode"
                value="readwrite"
                checked={openToolMode === "readwrite"}
                onchange={() => {
                  openToolMode = "readwrite";
                }}
                disabled={busy}
              />
              讀寫
            </label>
          </div>
        </fieldset>
      {/if}
      <div class="flex justify-end gap-2 pt-1">
        <button
          type="button"
          class={btn}
          disabled={busy}
          onclick={closeOpenToolDialog}>取消</button
        >
        <button
          type="button"
          class="{btnPrimary} gap-1.5"
          disabled={busy ||
            !openToolSandboxId ||
            (openMainAsTool && !openToolPath.trim())}
          onclick={() => void confirmOpenToolDialog()}
        >
          <PgIcon name="sparkles" size={13} />
          {openMainAsTool ? "開啟工具" : "開啟畫布"}
        </button>
      </div>
    {/if}
  </div>
</dialog>

<dialog
  bind:this={secretsDialogEl}
  class="playgrounds-secrets-dialog playgrounds-dialog border-skin-line bg-skin-fill text-skin-base m-auto w-[min(26rem,calc(100%-2rem))] max-h-[min(32rem,calc(100%-2rem))] rounded-xl border p-0 shadow-2xl backdrop:bg-black/55"
  onclose={onSecretsDialogClose}
>
  <div class="playgrounds-dialog-head">
    <div class="playgrounds-dialog-title-row">
      <span class="playgrounds-dialog-icon" aria-hidden="true">
        <PgIcon name="key" size={16} />
      </span>
      <div class="min-w-0">
        <h2 class="text-sm font-semibold">
          {secretEditorIntent === "rotate"
            ? "輪替密鑰"
            : secretEditorIntent === "create"
              ? "新增密鑰"
              : "密鑰庫"}
        </h2>
        <p class="text-skin-base/55 mt-0.5 text-[11px]">
          {#if secretStoreStatus.state === "absent"}
            尚未初始化
          {:else if secretStoreStatus.state === "locked"}
            已鎖定 · {secretStoreStatus.secretCount} 顆
            {#if secretStoreStatus.webauthnRegistered}
              · 生物識別已登錄
            {/if}
          {:else}
            已解鎖 · {secretStoreStatus.secretCount} 顆
            {#if secretStoreStatus.webauthnRegistered}
              · 生物識別已登錄
            {/if}
          {/if}
          · 不進 .sam
        </p>
      </div>
    </div>
    <button
      type="button"
      class="{btnIcon} text-skin-base/55"
      onclick={closeSecretsDialog}
      aria-label="關閉"
      title="關閉"
    >
      <PgIcon name="x" size={14} />
    </button>
  </div>
  <div class="space-y-3 px-4 py-3 text-sm">
    <p class="text-skin-base/60 m-0 text-xs leading-relaxed">
      遊樂場級密文庫。解鎖後 functions 以
      <code class="text-[11px]">await env.&lt;NAME&gt;.get()</code> 取值。頁面刷新＝鎖定。HOST
      只看名稱／狀態，讀不到值。
    </p>

    {#if secretStoreStatus.state === "absent"}
      <form
        class="space-y-2"
        onsubmit={ev => {
          ev.preventDefault();
          void handleInitSecretStore();
        }}
      >
        <p class="text-skin-base/55 m-0 text-[11px]">
          先設定復原密碼（生物識別之後可選）。
        </p>
        <label class="block text-xs" for="playgrounds-store-pw">密碼</label>
        <input
          id="playgrounds-store-pw"
          class={field}
          type="password"
          bind:value={storePasswordDraft}
          autocomplete="new-password"
        />
        <label class="block text-xs" for="playgrounds-store-pw2">確認密碼</label>
        <input
          id="playgrounds-store-pw2"
          class={field}
          type="password"
          bind:value={storePasswordConfirm}
          autocomplete="new-password"
        />
        <button
          type="submit"
          class="{btnPrimary} gap-1.5"
          disabled={busy || !storePasswordDraft}
        >
          建立並解鎖
        </button>
      </form>
    {:else if secretStoreStatus.state === "locked"}
      {#if secretStoreStatus.webauthnRegistered && webauthnPrfAvailable}
        <button
          type="button"
          class="{btnPrimary} w-full gap-1.5"
          disabled={busy}
          onclick={() => void handleUnlockSecretStoreWebAuthn()}
        >
          使用生物識別解鎖
        </button>
        <p class="text-skin-base/45 m-0 text-[11px]">或使用復原密碼：</p>
      {:else if secretStoreStatus.webauthnRegistered && !webauthnPrfAvailable}
        <p class="text-skin-base/55 m-0 text-[11px] leading-relaxed">
          已登錄生物識別，但此環境無法使用（{webauthnPrfReason || "不支援"}）。請用復原密碼解鎖。
        </p>
      {/if}
      <form
        class="space-y-2"
        onsubmit={ev => {
          ev.preventDefault();
          void handleUnlockSecretStore();
        }}
      >
        <label class="block text-xs" for="playgrounds-unlock-pw">解鎖密碼</label>
        <input
          id="playgrounds-unlock-pw"
          class={field}
          type="password"
          bind:value={storePasswordDraft}
          autocomplete="current-password"
        />
        <div class="flex flex-wrap gap-2">
          <button
            type="submit"
            class="{btnPrimary} gap-1.5"
            disabled={busy || !storePasswordDraft}
          >
            以密碼解鎖
          </button>
          <button
            type="button"
            class="{btn} text-[11px]"
            disabled={busy}
            onclick={() => void handleDestroySecretStore()}
          >
            銷毀庫…
          </button>
        </div>
      </form>
      {#if secretMetas.length > 0}
        <ul class="border-skin-line max-h-28 space-y-1 overflow-auto rounded-md border p-2">
          {#each secretMetas as meta}
            <li class="text-skin-base/55 text-xs">
              <code>{meta.name}</code>
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="{btn} text-[11px]"
          disabled={busy}
          onclick={() => void handleLockSecretStore()}
        >
          鎖定
        </button>
        <button
          type="button"
          class="{btn} text-[11px]"
          disabled={busy}
          onclick={() => void handleDestroySecretStore()}
        >
          銷毀庫…
        </button>
      </div>
      {#if webauthnPrfAvailable}
        {#if secretStoreStatus.webauthnRegistered}
          <div class="border-skin-line space-y-2 rounded-md border p-2">
            <p class="text-skin-base/55 m-0 text-[11px]">
              生物識別解鎖已登錄（日常解鎖可不輸密碼；復原仍靠密碼）。
            </p>
            <button
              type="button"
              class="{btn} text-[11px]"
              disabled={busy}
              onclick={() => void handleUnregisterWebAuthn()}
            >
              移除生物識別
            </button>
          </div>
        {:else}
          <form
            class="border-skin-line space-y-2 rounded-md border p-2"
            onsubmit={ev => {
              ev.preventDefault();
              void handleRegisterWebAuthn();
            }}
          >
            <p class="text-skin-base/55 m-0 text-[11px] leading-relaxed">
              可選：登錄裝置生物識別（Face ID／Touch ID／Windows Hello）以便日常解鎖。需再輸入復原密碼一次。
            </p>
            <label class="block text-xs" for="playgrounds-wa-pw">復原密碼</label>
            <input
              id="playgrounds-wa-pw"
              class={field}
              type="password"
              bind:value={webauthnRegisterPassword}
              autocomplete="current-password"
            />
            <button
              type="submit"
              class="{btnPrimary} gap-1.5"
              disabled={busy || !webauthnRegisterPassword.trim()}
            >
              登錄生物識別
            </button>
          </form>
        {/if}
      {:else if webauthnPrfReason}
        <p class="text-skin-base/45 m-0 text-[11px] leading-relaxed">
          生物識別解鎖不可用：{webauthnPrfReason}
        </p>
      {/if}
      <ul class="border-skin-line max-h-36 space-y-1 overflow-auto rounded-md border p-2">
        {#if secretMetas.length === 0}
          <li class="text-skin-base/45 text-xs">尚無密鑰</li>
        {:else}
          {#each secretMetas as meta}
            <li class="flex items-center justify-between gap-2 text-xs">
              <code>{meta.name}</code>
              <button
                type="button"
                class="text-skin-base/50 hover:text-red-700 dark:hover:text-red-300 text-[10px]"
                disabled={busy}
                onclick={() => void handleDeleteSecret(meta.name)}>刪除</button
              >
            </li>
          {/each}
        {/if}
      </ul>
      <form
        class="space-y-2"
        onsubmit={ev => {
          ev.preventDefault();
          void handleSaveSecret();
        }}
      >
        <label class="block text-xs" for="playgrounds-secret-name">名稱（env binding）</label>
        <input
          id="playgrounds-secret-name"
          class={field}
          bind:value={secretNameDraft}
          placeholder="OPENAI_API_KEY"
          autocomplete="off"
          spellcheck="false"
          readonly={secretEditorIntent === "rotate" && Boolean(secretNameDraft)}
        />
        <label class="block text-xs" for="playgrounds-secret-value">值（不回顯）</label>
        <input
          id="playgrounds-secret-value"
          class={field}
          type="password"
          name="secret-value"
          bind:value={secretValueDraft}
          autocomplete="new-password"
          spellcheck="false"
        />
        <button
          type="submit"
          class="{btnPrimary} gap-1.5"
          disabled={busy || !secretNameDraft.trim() || !secretValueDraft}
        >
          <PgIcon name="key" size={13} />
          {secretEditorIntent === "rotate" ? "覆寫儲存" : "儲存"}
        </button>
      </form>
    {/if}
  </div>
</dialog>

<dialog
  bind:this={uiDialogEl}
  class="playgrounds-ui-dialog playgrounds-dialog border-skin-line bg-skin-fill text-skin-base m-auto w-[min(26rem,calc(100%-2rem))] rounded-xl border p-0 shadow-2xl backdrop:bg-black/55"
  onclose={onUiDialogClose}
>
  {#if uiDialog}
    <div
      class="playgrounds-dialog-head {(uiDialog.kind === 'confirm' &&
        uiDialog.tone === 'danger') ||
      uiDialog.kind === 'typeConfirm'
        ? 'playgrounds-dialog-head--danger'
        : ''}"
    >
      <div class="playgrounds-dialog-title-row">
        <span
          class="playgrounds-dialog-icon {(uiDialog.kind === 'confirm' &&
            uiDialog.tone === 'danger') ||
          uiDialog.kind === 'typeConfirm'
            ? 'playgrounds-dialog-icon--danger'
            : ''}"
          aria-hidden="true"
        >
          <PgIcon name={uiDialog.icon} size={16} />
        </span>
        <h2 class="text-sm font-semibold">{uiDialog.title}</h2>
      </div>
    </div>
    <div class="px-4 py-3">
      {#if uiDialog.kind === "confirm"}
        <p class="text-skin-base/80 text-sm leading-relaxed">
          {uiDialog.message}
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class={btn} onclick={() => closeUiDialog(false)}
            >取消</button
          >
          <button
            type="button"
            class={uiDialog.tone === "danger"
              ? "playgrounds-btn inline-flex items-center rounded border border-red-600/70 bg-red-600/90 px-2.5 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              : btnPrimary}
            onclick={() => closeUiDialog(true)}>{uiDialog.confirmLabel}</button
          >
        </div>
      {:else if uiDialog.kind === "typeConfirm"}
        <p class="text-skin-base/80 text-sm leading-relaxed">
          {uiDialog.message}
        </p>
        <p class="text-skin-base/55 mt-3 text-xs">
          請輸入「{uiDialog.requiredText}」以確認（不含引號）。
        </p>
        <input
          class="{field} mt-2"
          bind:value={uiPromptDraft}
          autocomplete="off"
          spellcheck="false"
          onkeydown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitUiTypeConfirm();
            }
          }}
        />
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class={btn} onclick={() => closeUiDialog(false)}
            >取消</button
          >
          <button
            type="button"
            class="playgrounds-btn inline-flex items-center rounded border border-red-600/70 bg-red-600/90 px-2.5 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={uiPromptDraft.trim() !== uiDialog.requiredText || busy}
            onclick={submitUiTypeConfirm}>{uiDialog.confirmLabel}</button
          >
        </div>
      {:else if uiDialog.kind === "installConflict"}
        <p class="text-skin-base/80 whitespace-pre-line text-sm leading-relaxed">
          {uiDialog.message}
        </p>
        <p class="text-skin-base/55 mt-2 text-xs leading-relaxed">
          既有沙盒：<span class="text-skin-base/80 font-medium"
            >{uiDialog.existingName}</span
          >
        </p>
        <div class="mt-4 flex flex-col gap-2">
          <button
            type="button"
            class="{btnPrimary} min-h-11 w-full justify-center gap-1.5 px-3 py-2.5 text-sm"
            onclick={() => closeUiDialog("replace")}
          >
            取代
          </button>
          <p class="text-skin-base/45 m-0 text-[11px] leading-relaxed">
            完全清空既有沙盒（檔案目錄、KV、DB、checkpoint）後，以相同沙盒
            ID 重新安裝。
          </p>
          <button
            type="button"
            class="{btn} min-h-11 w-full justify-center gap-1.5 px-3 py-2.5 text-sm"
            onclick={() => closeUiDialog("keep")}
          >
            保留
          </button>
          <p class="text-skin-base/45 m-0 text-[11px] leading-relaxed">
            保留既有沙盒不動，另裝到新的沙盒 ID。
          </p>
          <button
            type="button"
            class="{btn} min-h-11 w-full justify-center px-3 py-2.5 text-sm"
            onclick={() => closeUiDialog(null)}
          >
            取消
          </button>
        </div>
      {:else if uiDialog.kind === "stateMove"}
        <p class="text-skin-base/70 text-xs leading-relaxed">
          {uiDialog.message}
        </p>
        <fieldset class="border-skin-line mt-3 space-y-2 rounded-md border p-3">
          <legend class="text-skin-base/45 px-1 text-[10px] font-semibold tracking-wider uppercase">
            執行期狀態
          </legend>
          <label class="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              class="mt-0.5"
              bind:checked={uiStateDraft.kv}
            />
            <span>
              <span class="font-medium">KV</span>
              <span class="text-skin-base/50 block text-[11px]"
                >Durable KV（含 Agent 對話 session 等）</span
              >
            </span>
          </label>
          <label class="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              class="mt-0.5"
              bind:checked={uiStateDraft.db}
            />
            <span>
              <span class="font-medium">DB</span>
              <span class="text-skin-base/50 block text-[11px]"
                >仿 D1 的 SQLite 資料庫</span
              >
            </span>
          </label>
          <p class="text-skin-base/45 m-0 text-[11px] leading-relaxed">
            SecretStore 為遊樂場級密文庫，永不隨 .sam 搬動。
          </p>
          <div class="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              class="{btn} text-[11px]"
              onclick={() => {
                uiStateDraft = { kv: true, db: true, secrets: false };
              }}>全選</button
            >
            <button
              type="button"
              class="{btn} text-[11px]"
              onclick={() => {
                uiStateDraft = { ...PROJECT_STATE_NONE };
              }}>清除</button
            >
          </div>
        </fieldset>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class={btn} onclick={() => closeUiDialog(null)}
            >取消</button
          >
          <button type="button" class={btnPrimary} onclick={submitUiStateMove}
            >{uiDialog.confirmLabel}</button
          >
        </div>
      {:else}
        {#if uiDialog.message}
          <p class="text-skin-base/60 text-xs">{uiDialog.message}</p>
        {/if}
        <input
          class="{field} mt-3"
          bind:value={uiPromptDraft}
          onkeydown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitUiPrompt();
            }
          }}
        />
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class={btn} onclick={() => closeUiDialog(null)}
            >取消</button
          >
          <button type="button" class={btnPrimary} onclick={submitUiPrompt}
            >確定</button
          >
        </div>
      {/if}
    </div>
  {/if}
</dialog>

<dialog
  bind:this={settingsDialogEl}
  class="playgrounds-dialog border-skin-line bg-skin-fill text-skin-base w-[min(26rem,calc(100vw-1.5rem))] rounded-lg border p-0 shadow-xl backdrop:bg-black/40"
  aria-labelledby="playgrounds-settings-title"
  onclose={() => {
    /* keep prefs already written on toggle */
  }}
>
  <div class="playgrounds-dialog-head border-skin-line border-b px-4 py-3">
    <div class="playgrounds-dialog-title-row">
      <span class="playgrounds-dialog-icon" aria-hidden="true">
        <PgIcon name="settings" size={16} />
      </span>
      <h2 id="playgrounds-settings-title" class="text-sm font-semibold">設定</h2>
    </div>
  </div>
  <div class="space-y-4 px-4 py-3">
    <fieldset class="border-skin-line space-y-2 rounded-md border p-3">
      <legend
        class="text-skin-base/45 px-1 text-[10px] font-semibold tracking-wider uppercase"
        >Console</legend
      >
      <label class="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          class="mt-0.5"
          checked={shellPrefs.mirrorConsoleToBrowser}
          onchange={e => {
            const el = e.currentTarget;
            if (el instanceof HTMLInputElement) {
              setMirrorConsoleToBrowser(el.checked);
            }
          }}
        />
        <span>
          <span class="font-medium">鏡像到瀏覽器 console</span>
          <span class="text-skin-base/50 block text-[11px] leading-relaxed">
            預設關閉，避免畫布 log 混進 DevTools、干擾遊樂場本身除錯。開啟後，畫布的
            console.debug／log／warn／error 會同時出現在瀏覽器開發者工具。工作面板仍會保留完整輸出。
          </span>
        </span>
      </label>
    </fieldset>
    <p class="text-skin-base/40 text-[11px] leading-relaxed">
      偏好存在此瀏覽器的 localStorage（{`playgrounds-prefs-v1`}），不會進沙盒包裹。
    </p>
    <div class="flex justify-end">
      <button type="button" class={btnPrimary} onclick={closeSettingsDialog}
        >完成</button
      >
    </div>
  </div>
</dialog>

<dialog
  bind:this={inventoryDialogEl}
  class="playgrounds-dialog border-skin-line bg-skin-fill text-skin-base w-[min(42rem,calc(100vw-1.5rem))] rounded-lg border p-0 shadow-xl backdrop:bg-black/40"
  aria-labelledby="playgrounds-inventory-title"
>
  <div class="playgrounds-dialog-head border-skin-line border-b px-4 py-3">
    <div class="playgrounds-dialog-title-row">
      <span class="playgrounds-dialog-icon" aria-hidden="true">
        <PgIcon name="layers" size={16} />
      </span>
      <h2 id="playgrounds-inventory-title" class="text-sm font-semibold">
        管理沙盒
      </h2>
    </div>
    <p class="text-skin-base/50 mt-1 text-[11px] leading-relaxed">
      {manageMainTab === "fleet"
        ? "運行：Agent 狀態、mailbox、Needs attention。Picker 仍只顯示工作集。"
        : "庫存：盤點全部實例。Picker 只顯示工作集；此處可加入／移出、開啟或回收。"}
    </p>
    <div
      class="mt-2 flex flex-wrap gap-1"
      role="tablist"
      aria-label="管理沙盒主分頁"
    >
      <button
        type="button"
        role="tab"
        aria-selected={manageMainTab === "inventory"}
        class="rounded px-2.5 py-1 text-[11px] {manageMainTab === 'inventory'
          ? 'bg-skin-accent/15 text-skin-accent font-semibold'
          : 'text-skin-base/60 hover:bg-skin-card'}"
        onclick={() => (manageMainTab = "inventory")}
      >
        庫存
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={manageMainTab === "fleet"}
        class="rounded px-2.5 py-1 text-[11px] {manageMainTab === 'fleet'
          ? 'bg-skin-accent/15 text-skin-accent font-semibold'
          : 'text-skin-base/60 hover:bg-skin-card'}"
        onclick={() => (manageMainTab = "fleet")}
      >
        運行
      </button>
    </div>
  </div>
  <div class="flex max-h-[min(70vh,36rem)] flex-col gap-3 px-4 py-3">
    {#if manageMainTab === "fleet"}
      <FleetPanel
        {projects}
        activeSessionSeatIds={fleetActiveSeatIds}
        sessionIdBySandbox={fleetSessionIdBySandbox}
        {activeAgentSandboxId}
        {busy}
        onOpen={id => void openFromInventory(id)}
        onSetWorkingSet={(id, inWs) => void setProjectWorkingSet(id, inWs)}
        onDelete={id => void handleDeleteProject(id)}
      />
      <div class="flex justify-end">
        <button type="button" class={btnPrimary} onclick={closeInventoryDialog}
          >完成</button
        >
      </div>
    {:else}
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-[12rem] flex-1">
          <label class="sr-only" for="playgrounds-inventory-filter"
            >搜尋沙盒</label
          >
          <span
            class="text-skin-base/40 pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
            aria-hidden="true"
          >
            <PgIcon name="search" size={12} />
          </span>
          <input
            id="playgrounds-inventory-filter"
            class="{field} h-8 pl-7 text-xs"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="名稱／id／意圖…"
            disabled={busy}
            bind:value={inventoryFilter}
          />
        </div>
        <button
          type="button"
          class="{btn} text-[11px]"
          disabled={busy || recyclableCount === 0}
          title="刪除 agentManaged 且不在工作集、非現行總管的沙盒"
          onclick={() => void handleCleanupRecyclable()}
        >
          清理可回收（{recyclableCount}）
        </button>
      </div>
      <div class="flex flex-wrap gap-1" role="tablist" aria-label="沙盒分區">
        {#each [
          { id: "all" as const, label: `全部（${projects.length}）` },
          {
            id: "working" as const,
            label: `工作集（${listWorkingSet(projects).length}）`,
          },
          {
            id: "recyclable" as const,
            label: `可回收（${recyclableCount}）`,
          },
          {
            id: "lineage" as const,
            label: `有血統（${projects.filter(p => p.clonedFrom).length}）`,
          },
        ] as tab (tab.id)}
          <button
            type="button"
            role="tab"
            aria-selected={inventorySection === tab.id}
            class="rounded px-2 py-1 text-[11px] {inventorySection === tab.id
              ? 'bg-skin-accent/15 text-skin-accent font-semibold'
              : 'text-skin-base/60 hover:bg-skin-card'}"
            onclick={() => (inventorySection = tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </div>
      <ul
        class="border-skin-line min-h-0 flex-1 space-y-1 overflow-auto rounded-md border p-1"
        role="list"
      >
        {#if inventoryProjects.length === 0}
          <li class="text-skin-base/45 px-2 py-3 text-center text-xs">
            此分區沒有沙盒
          </li>
        {:else}
          {#each inventoryProjects as p (p.id)}
            {@const inWs = isInWorkingSet(p)}
            {@const intent = cloneIntentLabel(p.cloneIntent)}
            {@const fromName = projectNameById(p.clonedFrom)}
            <li
              class="border-skin-line/60 hover:bg-skin-card/60 flex flex-col gap-1 rounded border px-2 py-1.5"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="truncate text-xs font-medium">{p.name}</span>
                    {#if p.id === activeId}
                      <span
                        class="bg-skin-accent/15 text-skin-accent rounded px-1 py-0.5 text-[9px] font-semibold"
                        >工作中</span
                      >
                    {/if}
                    {#if p.id === activeAgentSandboxId}
                      <span
                        class="bg-skin-accent/15 text-skin-accent rounded px-1 py-0.5 text-[9px] font-semibold"
                        >總管</span
                      >
                    {/if}
                    {#if findCanvasBySandboxId(mainTabs, p.id)}
                      <span
                        class="bg-skin-accent/15 text-skin-accent rounded px-1 py-0.5 text-[9px] font-semibold"
                        >{findCanvasBySandboxId(mainTabs, p.id)?.grant
                          ? "工具"
                          : "畫布"}</span
                      >
                    {/if}
                    {#if inWs}
                      <span
                        class="text-skin-base/45 rounded bg-black/5 px-1 py-0.5 text-[9px] dark:bg-white/10"
                        >工作集</span
                      >
                    {/if}
                    {#if p.agentManaged}
                      <span
                        class="text-skin-base/45 rounded bg-black/5 px-1 py-0.5 text-[9px] dark:bg-white/10"
                        >Agent 管理</span
                      >
                    {/if}
                  </div>
                  <p class="text-skin-base/40 mt-0.5 truncate text-[10px]">
                    {p.id}
                    {#if intent}
                      · {intent}
                    {/if}
                    {#if fromName}
                      · 來自 {fromName}
                    {/if}
                    · {new Date(p.updatedAt).toLocaleString("zh-TW")}
                  </p>
                </div>
                <div class="flex shrink-0 flex-wrap justify-end gap-1">
                  <button
                    type="button"
                    class="{btn} px-1.5 py-0.5 text-[10px]"
                    disabled={busy}
                    onclick={() => void openFromInventory(p.id)}
                  >
                    開啟
                  </button>
                  <button
                    type="button"
                    class="{btn} px-1.5 py-0.5 text-[10px]"
                    disabled={busy}
                    onclick={() => void setProjectWorkingSet(p.id, !inWs)}
                  >
                    {inWs ? "移出工作集" : "加入工作集"}
                  </button>
                  <button
                    type="button"
                    class="{btn} text-skin-accent px-1.5 py-0.5 text-[10px]"
                    disabled={busy || p.id === activeAgentSandboxId}
                    onclick={() => void handleDeleteProject(p.id)}
                  >
                    刪除
                  </button>
                </div>
              </div>
            </li>
          {/each}
        {/if}
      </ul>
      <div
        class="border-skin-line/80 flex flex-wrap items-center justify-between gap-2 border-t pt-2"
      >
        <button
          type="button"
          class="{btn} text-[11px] text-red-700 dark:text-red-300"
          disabled={busy}
          title="清光本機遊樂場資料，回到第一次開啟時的空場"
          onclick={() => void handleFactoryResetPlaygrounds()}
        >
          重置遊樂場
        </button>
        <button type="button" class={btnPrimary} onclick={closeInventoryDialog}
          >完成</button
        >
      </div>
    {/if}
  </div>
</dialog>

<PlatformInviteShareDialog
  bind:open={inviteShareOpen}
  bind:payload={inviteSharePayload}
/>

<PlatformInviteJoinDialog
  bind:open={inviteJoinOpen}
  bind:payload={inviteJoinPayload}
  bind:pending={inviteJoinPending}
  bind:error={inviteJoinError}
  bind:recovery={inviteJoinRecovery}
  bind:copyUrl={inviteJoinCopyUrl}
  bind:busy={inviteJoinBusy}
  bind:status={inviteJoinStatus}
  onAccept={onInviteJoinAccept}
  onDecline={onInviteJoinDecline}
/>
