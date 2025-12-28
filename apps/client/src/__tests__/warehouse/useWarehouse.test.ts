import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useToast,
} from "../../hooks/useWarehouse";
import type { ToastMessage } from "../../components/warehouse/types";

describe("useWarehouse Hooks", () => {
  describe("useToast", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should show toast with message and type", () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showToast("Test message", "success");
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].message).toBe("Test message");
      expect(result.current.toasts[0].type).toBe("success");
    });

    it("should use info as default type", () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showToast("Default type message");
      });

      expect(result.current.toasts[0].type).toBe("info");
    });

    it("should dismiss toast by id", () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showToast("Message 1", "info");
      });
      
      jest.advanceTimersByTime(10);

      act(() => {
        result.current.showToast("Message 2", "success");
      });

      expect(result.current.toasts).toHaveLength(2);

      const toastId = result.current.toasts[0].id;
      act(() => {
        result.current.dismissToast(toastId);
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].message).toBe("Message 2");
    });

    it("should handle multiple toasts", () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showToast("Message 1", "info");
      });
      jest.advanceTimersByTime(10);
      act(() => {
        result.current.showToast("Message 2", "success");
      });
      jest.advanceTimersByTime(10);
      act(() => {
        result.current.showToast("Message 3", "error");
      });

      expect(result.current.toasts).toHaveLength(3);
      expect(result.current.toasts.map((t: ToastMessage) => t.message)).toEqual([
        "Message 1",
        "Message 2",
        "Message 3",
      ]);
    });

    it("should generate unique ids for each toast", () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showToast("Message 1");
      });
      
      jest.advanceTimersByTime(10);
      
      act(() => {
        result.current.showToast("Message 2");
      });

      const ids = result.current.toasts.map((t: ToastMessage) => t.id);
      expect(ids.length).toBe(2);
      expect(ids[0]).not.toBe(ids[1]);
    });

    it("should support all toast types", () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showToast("Info", "info");
      });
      expect(result.current.toasts[0].type).toBe("info");

      jest.advanceTimersByTime(10);
      act(() => {
        result.current.showToast("Success", "success");
      });
      expect(result.current.toasts[1].type).toBe("success");

      jest.advanceTimersByTime(10);
      act(() => {
        result.current.showToast("Warning", "warning");
      });
      expect(result.current.toasts[2].type).toBe("warning");

      jest.advanceTimersByTime(10);
      act(() => {
        result.current.showToast("Error", "error");
      });
      expect(result.current.toasts[3].type).toBe("error");
    });

    it("should maintain order of toasts", () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showToast("First");
      });
      jest.advanceTimersByTime(10);
      act(() => {
        result.current.showToast("Second");
      });
      jest.advanceTimersByTime(10);
      act(() => {
        result.current.showToast("Third");
      });

      expect(result.current.toasts[0].message).toBe("First");
      expect(result.current.toasts[1].message).toBe("Second");
      expect(result.current.toasts[2].message).toBe("Third");
    });

    it("should not affect other toasts when dismissing one", () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showToast("Keep 1");
      });
      jest.advanceTimersByTime(10);
      act(() => {
        result.current.showToast("Remove");
      });
      jest.advanceTimersByTime(10);
      act(() => {
        result.current.showToast("Keep 2");
      });

      expect(result.current.toasts).toHaveLength(3);
      
      const removeId = result.current.toasts[1].id;
      act(() => {
        result.current.dismissToast(removeId);
      });

      expect(result.current.toasts).toHaveLength(2);
      expect(result.current.toasts[0].message).toBe("Keep 1");
      expect(result.current.toasts[1].message).toBe("Keep 2");
    });

    it("should handle dismissing non-existent toast gracefully", () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.showToast("Test");
      });

      act(() => {
        result.current.dismissToast("non-existent-id");
      });

      expect(result.current.toasts).toHaveLength(1);
    });

    it("should start with empty toasts array", () => {
      const { result } = renderHook(() => useToast());

      expect(result.current.toasts).toEqual([]);
    });
  });
});
