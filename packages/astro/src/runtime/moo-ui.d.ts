// The published Core constructors share this public initialization lifecycle.
interface RuntimeInstance {
  dispose(): void;
}

interface RuntimeConstructor<T extends RuntimeInstance = RuntimeInstance> {
  new (element: Element, config?: Readonly<Record<string, unknown>>): T;
  getInstance(element: Element | null): T | null;
  getOrCreateInstance(element: Element, config?: Readonly<Record<string, unknown>>): T;
}

interface TocRuntimeInstance extends RuntimeInstance {
  refresh(options?: Readonly<{ activationOffset?: number }>): this;
}

interface FloatingPanelRuntimeInstance extends RuntimeInstance {
  setVisible(visible: boolean): void;
}

export declare function loadChart(): Promise<RuntimeConstructor>;
export declare function initSheets(root?: Document | Element): () => void;
export declare const Combobox: RuntimeConstructor;
export declare const ContextMenu: RuntimeConstructor;
export declare const DataTable: RuntimeConstructor;
export declare const Datepicker: RuntimeConstructor;
export declare const FloatingPanel: RuntimeConstructor<FloatingPanelRuntimeInstance>;
export declare const MooCalendar: RuntimeConstructor;
export declare const MooDateRangePicker: RuntimeConstructor;
export declare const Sidebar: RuntimeConstructor;
export declare const TableOfContents: RuntimeConstructor<TocRuntimeInstance>;
export declare const Slider: RuntimeConstructor;
export declare const OverlayScrollbar: RuntimeConstructor;

declare const MooUI: {
  readonly loadChart: typeof loadChart;
  readonly initSheets: typeof initSheets;
  readonly Combobox: typeof Combobox;
  readonly ContextMenu: typeof ContextMenu;
  readonly DataTable: typeof DataTable;
  readonly Datepicker: typeof Datepicker;
  readonly FloatingPanel: typeof FloatingPanel;
  readonly MooCalendar: typeof MooCalendar;
  readonly MooDateRangePicker: typeof MooDateRangePicker;
  readonly Sidebar: typeof Sidebar;
  readonly TableOfContents: typeof TableOfContents;
  readonly Slider: typeof Slider;
  readonly OverlayScrollbar: typeof OverlayScrollbar;
};
export default MooUI;
