import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Which tab to open the FileManagerDialog on. Set when File-menu items
 *  invoke `openFileManager(tab)`; cleared back to undefined on close. */
export type FileManagerTab = "project" | "new" | "open";

/** Scratch-style editor tabs. The active tab determines what's shown
 *  in the main editing area for the currently-selected sprite (or
 *  stage). `code` keeps the existing Blockly workspace; `costumes`
 *  shows the costume picker (or backdrops when Stage is selected);
 *  `sounds` shows the sound picker. */
export type EditorTab = "code" | "costumes" | "sounds";

interface UiStore {
  showAssetManager: boolean;
  showBlockOrganizer: boolean;
  showFileManager: boolean;
  /** Tab the FileManagerDialog should open on; undefined = use its default. */
  fileManagerInitialTab?: FileManagerTab;
  showAiPanel: boolean;
  showInspector: boolean;
  showBottomPanel: boolean;
  showStage: boolean;
  showVibeDialog: boolean;
  showModulesDialog: boolean;
  darkMode: boolean;
  /**
   * Player mode hides all editing UI (toolbar, editor, inspector, bottom
   * panel) so only the running stage is visible — like TurboWarp's
   * "Player Mode" / fullscreen-and-run view. Toggled from the toolbar
   * or by pressing Escape while active.
   */
  playerMode: boolean;
  /**
   * When false, the stage canvas omits the small name label drawn below
   * each sprite. The label is on by default to match Scratch — toggle
   * off for a cleaner stage during demos or screenshots.
   */
  showSpriteNames: boolean;
  /**
   * Target render/scheduler tick rate. The scheduler still schedules via
   * raf, but skips ticks whose elapsed time is below 1000/targetFps.
   * `Infinity` means "tick every animation frame" (~60+).
   */
  targetFps: number;
  /** Which Scratch-style editor tab is active in the main editor area. */
  editorTab: EditorTab;
  activeBottomTab: "code" | "diagnostics" | "logs" | "files" | "ir";
  selectedBlockId?: string;
  toggleAssetManager(): void;
  toggleBlockOrganizer(): void;
  toggleFileManager(): void;
  /** Open the FileManagerDialog directly to a specific tab. Used by
   *  the File ▾ menu's New / Open shortcuts. */
  openFileManager(tab: FileManagerTab): void;
  toggleAiPanel(): void;
  toggleInspector(): void;
  toggleBottomPanel(): void;
  toggleStage(): void;
  toggleVibeDialog(): void;
  toggleModulesDialog(): void;
  toggleDarkMode(): void;
  togglePlayerMode(): void;
  toggleSpriteNames(): void;
  setTargetFps(fps: number): void;
  setBottomTab(tab: UiStore["activeBottomTab"]): void;
  setSelectedBlockId(id?: string): void;
  setEditorTab(tab: EditorTab): void;
}

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      showAssetManager: false,
      showBlockOrganizer: false,
      showFileManager: false,
      showAiPanel: false,
      showInspector: false,
      showBottomPanel: false,
      showStage: true,
      showVibeDialog: false,
      showModulesDialog: false,
      darkMode: false,
      playerMode: false,
      showSpriteNames: true,
      targetFps: 30,
      editorTab: "code",
      activeBottomTab: "code",
      selectedBlockId: undefined,
      toggleAssetManager() {
        set((state) => ({ showAssetManager: !state.showAssetManager }));
      },
      toggleBlockOrganizer() {
        set((state) => ({ showBlockOrganizer: !state.showBlockOrganizer }));
      },
      toggleFileManager() {
        set((state) => ({
          showFileManager: !state.showFileManager,
          // On close, drop any tab override so the next plain Files…
          // click reopens to the default tab.
          fileManagerInitialTab: state.showFileManager
            ? undefined
            : state.fileManagerInitialTab,
        }));
      },
      openFileManager(tab) {
        set({ showFileManager: true, fileManagerInitialTab: tab });
      },
      toggleAiPanel() {
        set((state) => ({ showAiPanel: !state.showAiPanel }));
      },
      toggleInspector() {
        set((state) => ({ showInspector: !state.showInspector }));
      },
      toggleBottomPanel() {
        set((state) => ({ showBottomPanel: !state.showBottomPanel }));
      },
      toggleStage() {
        set((state) => ({ showStage: !state.showStage }));
      },
      toggleVibeDialog() {
        set((state) => ({ showVibeDialog: !state.showVibeDialog }));
      },
      toggleModulesDialog() {
        set((state) => ({ showModulesDialog: !state.showModulesDialog }));
      },
      toggleDarkMode() {
        set((state) => ({ darkMode: !state.darkMode }));
      },
      togglePlayerMode() {
        set((state) => ({ playerMode: !state.playerMode }));
      },
      toggleSpriteNames() {
        set((state) => ({ showSpriteNames: !state.showSpriteNames }));
      },
      setTargetFps(fps) {
        // Allow Infinity for "unlimited"; clamp anything else to a sane band.
        const clamped = fps === Infinity ? Infinity : Math.max(1, Math.min(240, fps));
        set({ targetFps: clamped });
      },
      setBottomTab(tab) {
        // Selecting a tab implies the user wants to look at it; force
        // the panel visible. Otherwise toolbar actions like ▶ Run
        // (which selects "logs") silently swap the tab on a collapsed
        // panel and the user sees nothing.
        set({ activeBottomTab: tab, showBottomPanel: true });
      },
      setSelectedBlockId(id) {
        set({ selectedBlockId: id });
      },
      setEditorTab(tab) {
        set({ editorTab: tab });
      }
    }),
    {
      name: "rustyblocks-ui",
      partialize: (state: UiStore) => ({
        darkMode: state.darkMode,
        targetFps: state.targetFps,
        showSpriteNames: state.showSpriteNames,
      }),
    }
  )
);
