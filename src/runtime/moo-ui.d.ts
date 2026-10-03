// The published Core constructors share this public initialization lifecycle.
interface RuntimeInstance {
  dispose(): void;
}

interface RuntimeConstructor {
  new (element: Element, config?: Readonly<Record<string, unknown>>): RuntimeInstance;
  getInstance(element: Element | null): RuntimeInstance | null;
  getOrCreateInstance(element: Element, config?: Readonly<Record<string, unknown>>): RuntimeInstance;
}

export declare function loadChart(): Promise<RuntimeConstructor>;
export declare function initSheets(root?: Document | Element): () => void;
export declare const Combobox: RuntimeConstructor;
export declare const ContextMenu: RuntimeConstructor;
export declare const DataTable: RuntimeConstructor;
export declare const Datepicker: RuntimeConstructor;
export declare const MooCalendar: RuntimeConstructor;
export declare const MooDateRangePicker: RuntimeConstructor;
export declare const Sidebar: RuntimeConstructor;
export declare const Slider: RuntimeConstructor;

declare const MooUI: {
  readonly loadChart: typeof loadChart;
  readonly initSheets: typeof initSheets;
  readonly Combobox: typeof Combobox;
  readonly ContextMenu: typeof ContextMenu;
  readonly DataTable: typeof DataTable;
  readonly Datepicker: typeof Datepicker;
  readonly MooCalendar: typeof MooCalendar;
  readonly MooDateRangePicker: typeof MooDateRangePicker;
  readonly Sidebar: typeof Sidebar;
  readonly Slider: typeof Slider;
};
export default MooUI;
