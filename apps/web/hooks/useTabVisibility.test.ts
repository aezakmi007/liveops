import { renderHook } from "@testing-library/react";
import { useTabVisibility } from "./useTabVisibility";

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
}

function fireVisibilityChange(): void {
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useTabVisibility", () => {
  afterEach(() => {
    setHidden(false);
  });

  it("calls onHide when the tab becomes hidden", () => {
    const onHide = jest.fn();
    const onShow = jest.fn();
    renderHook(() => useTabVisibility({ onHide, onShow }));

    setHidden(true);
    fireVisibilityChange();

    expect(onHide).toHaveBeenCalledTimes(1);
    expect(onShow).not.toHaveBeenCalled();
  });

  it("calls onShow when the tab becomes visible again", () => {
    const onHide = jest.fn();
    const onShow = jest.fn();
    renderHook(() => useTabVisibility({ onHide, onShow }));

    setHidden(true);
    fireVisibilityChange();
    setHidden(false);
    fireVisibilityChange();

    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it("removes its listener on unmount", () => {
    const onHide = jest.fn();
    const { unmount } = renderHook(() => useTabVisibility({ onHide }));

    unmount();
    setHidden(true);
    fireVisibilityChange();

    expect(onHide).not.toHaveBeenCalled();
  });

  it("tolerates missing callbacks", () => {
    expect(() => {
      renderHook(() => useTabVisibility({}));
      setHidden(true);
      fireVisibilityChange();
    }).not.toThrow();
  });
});
