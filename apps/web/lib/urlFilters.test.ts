import { EMPTY_FILTERS, type Filters } from "@liveops/shared";
import { filtersToSearchParams, searchParamsToFilters } from "./urlFilters";

describe("searchParamsToFilters", () => {
  it("returns EMPTY_FILTERS-equivalent for an empty query string", () => {
    expect(searchParamsToFilters(new URLSearchParams())).toEqual(EMPTY_FILTERS);
  });

  it("parses levels, dropping unknown values", () => {
    const params = new URLSearchParams("levels=ERROR,FATAL,BOGUS");
    expect(searchParamsToFilters(params).levels).toEqual(["ERROR", "FATAL"]);
  });

  it("parses services as-is", () => {
    const params = new URLSearchParams("services=auth,payments-api");
    expect(searchParamsToFilters(params).services).toEqual(["auth", "payments-api"]);
  });

  it("parses the text query", () => {
    const params = new URLSearchParams("q=timeout");
    expect(searchParamsToFilters(params).query).toBe("timeout");
  });

  it("parses from/to as numbers, ignoring invalid values", () => {
    expect(searchParamsToFilters(new URLSearchParams("from=100&to=200"))).toMatchObject({
      from: 100,
      to: 200,
    });
    expect(searchParamsToFilters(new URLSearchParams("from=not-a-number")).from).toBeUndefined();
  });
});

describe("filtersToSearchParams", () => {
  it("produces an empty query string for EMPTY_FILTERS", () => {
    expect(filtersToSearchParams(EMPTY_FILTERS).toString()).toBe("");
  });

  it("omits empty/default fields rather than writing them blank", () => {
    const params = filtersToSearchParams({ ...EMPTY_FILTERS, levels: ["ERROR"] });
    expect(params.toString()).toBe("levels=ERROR");
  });

  it("round-trips through searchParamsToFilters", () => {
    const original: Filters = {
      levels: ["ERROR", "FATAL"],
      services: ["auth", "gateway"],
      query: "timeout",
      from: 1000,
      to: 2000,
    };
    const roundTripped = searchParamsToFilters(filtersToSearchParams(original));
    expect(roundTripped).toEqual(original);
  });
});
