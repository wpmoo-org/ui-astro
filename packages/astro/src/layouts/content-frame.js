const columns = {
  lg: {
    2: ["col-lg-10", "col-lg-2"],
    3: ["col-lg-9", "col-lg-3"],
    4: ["col-lg-8", "col-lg-4"],
    5: ["col-lg-7", "col-lg-5"],
    6: ["col-lg-6", "col-lg-6"],
  },
  xl: {
    2: ["col-xl-10", "col-xl-2"],
    3: ["col-xl-9", "col-xl-3"],
    4: ["col-xl-8", "col-xl-4"],
    5: ["col-xl-7", "col-xl-5"],
    6: ["col-xl-6", "col-xl-6"],
  },
  xxl: {
    2: ["col-xxl-10", "col-xxl-2"],
    3: ["col-xxl-9", "col-xxl-3"],
    4: ["col-xxl-8", "col-xxl-4"],
    5: ["col-xxl-7", "col-xxl-5"],
    6: ["col-xxl-6", "col-xxl-6"],
  },
};
const responsive = {
  lg: {
    first: "order-lg-1",
    last: "order-lg-2",
    trigger: "d-lg-none",
    visible: "d-lg-block",
    sticky: "sticky-lg-top",
  },
  xl: {
    first: "order-xl-1",
    last: "order-xl-2",
    trigger: "d-xl-none",
    visible: "d-xl-block",
    sticky: "sticky-xl-top",
  },
  xxl: {
    first: "order-xxl-1",
    last: "order-xxl-2",
    trigger: "d-xxl-none",
    visible: "d-xxl-block",
    sticky: "sticky-xxl-top",
  },
};
export function contentFrameClasses(aside, dir = "ltr") {
  const sizes = columns[aside.breakpoint]?.[aside.columns];
  if (!sizes || !["ltr", "rtl"].includes(dir))
    throw new TypeError("Invalid content frame options");
  const rules = responsive[aside.breakpoint];
  const first = (aside.side === "left") === (dir === "ltr");
  const before = aside.mobile === "collapse-before";
  return {
    main: [
      "col-12",
      sizes[0],
      before ? "order-2" : "order-1",
      first ? rules.last : rules.first,
    ],
    aside: [
      "col-12",
      sizes[1],
      before ? "order-1" : "order-2",
      first ? rules.first : rules.last,
      "align-self-start",
      ...(aside.sticky ? [rules.sticky] : []),
      ...(aside.mobile === "hidden" ? ["d-none", rules.visible] : []),
    ],
    trigger: rules.trigger,
    visible: rules.visible,
  };
}
