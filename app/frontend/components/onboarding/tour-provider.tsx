"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MotionConfig, useReducedMotion } from "motion/react";
import { NextStep, NextStepProvider, useNextStep } from "nextstepjs";
import { useAuthStore } from "@/store/auth";
import { hasSeenTour, markTourSeen, resetTours, resolveTour, type TourName } from "@/lib/tours";
import { TourCard } from "./tour-card";

interface ActiveTour {
  tour: TourName;
  steps: ReturnType<typeof resolveTour>;
}

interface TourApi {
  startOnce: (name: TourName) => boolean;
  close: (name: TourName) => void;
  replay: () => void;
  isActive: () => boolean;
}

const TourContext = createContext<TourApi | null>(null);

export function useTour(): TourApi {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
}

export function useAutoTour(name: TourName, ready: boolean, delayMs = 700) {
  const { startOnce, close } = useTour();
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => startOnce(name), delayMs);
    return () => {
      clearTimeout(t);
      close(name);
    };
  }, [name, ready, delayMs, startOnce, close]);
}

/** An app dialog (Radix sets data-state) as opposed to the tour's own card. */
const OPEN_DIALOG = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';
const TOUR_Z = 10000;
/** Under the app's dialogs (z-50), so one opened mid-tour (the vault unlock
 *  prompt, say) shows above the tour instead of under it. */
const TOUR_Z_UNDER_DIALOG = 40;

/** Whether an app dialog is open, watched only while `watch` is on. */
export function useDialogOpen(watch: boolean): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!watch) return;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setOpen(document.querySelector(OPEN_DIALOG) !== null));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [watch]);
  return watch && open;
}

function TourController({ children }: { children: ReactNode }) {
  const t = useTranslations("ui.tour.steps");
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const userId = useAuthStore((s) => s.user?.id);
  const router = useRouter();
  const pathname = usePathname();
  const { startNextStep, closeNextStep, currentTour, isNextStepVisible } = useNextStep();
  const [active, setActive] = useState<ActiveTour[]>([]);
  const pending = useRef<TourName | null>(null);
  const live = useRef({ currentTour, isNextStepVisible, startNextStep, closeNextStep });
  useEffect(() => {
    live.current = { currentTour, isNextStepVisible, startNextStep, closeNextStep };
  }, [currentTour, isNextStepVisible, startNextStep, closeNextStep]);

  useEffect(() => {
    if (!pending.current) return;
    const name = pending.current;
    pending.current = null;
    live.current.startNextStep(name);
  }, [active]);

  const begin = useCallback(
    (name: TourName) => {
      if (!userId) return false;
      const steps = resolveTour(name).map((step) => {
        const key = `${name === "share-copy" ? "shareCopy" : name}.${step.index}`;
        return {
          ...step,
          title: tRef.current(`${key}.title`),
          content: tRef.current(`${key}.content`),
        };
      });
      if (steps.length === 0) return false;
      if (live.current.isNextStepVisible) live.current.closeNextStep();
      markTourSeen(userId, name);
      pending.current = name;
      setActive([{ tour: name, steps }]);
      return true;
    },
    [userId],
  );

  const startOnce = useCallback(
    (name: TourName) => {
      if (!userId || hasSeenTour(userId, name) || live.current.isNextStepVisible) return false;
      return begin(name);
    },
    [userId, begin],
  );

  const close = useCallback((name: TourName) => {
    if (live.current.isNextStepVisible && live.current.currentTour === name) {
      live.current.closeNextStep();
    }
  }, []);

  const replay = useCallback(() => {
    if (!userId) return;
    resetTours(userId);
    if (pathname === "/dashboard") begin("vault");
    else if (pathname === "/spaces") begin("spaces");
    else router.push("/dashboard");
  }, [userId, pathname, begin, router]);

  const isActive = useCallback(() => live.current.isNextStepVisible, []);

  const api = useMemo(
    () => ({ startOnce, close, replay, isActive }),
    [startOnce, close, replay, isActive],
  );
  const reduce = useReducedMotion();
  const dialogOpen = useDialogOpen(isNextStepVisible);

  return (
    <TourContext.Provider value={api}>
      {children}
      <MotionConfig reducedMotion="user">
        <NextStep
          steps={active}
          cardComponent={TourCard}
          cardTransition={reduce ? { duration: 0 } : { ease: "easeOut", duration: 0.35 }}
          shadowRgb="8, 10, 20"
          shadowOpacity="0.55"
          onSkip={(_step, tour) => {
            if (tour === "share" && userId) markTourSeen(userId, "share-copy");
          }}
          displayArrow={false}
          clickThroughOverlay
          disableConsoleLogs
          noInViewScroll={false}
          scrollToTop={false}
          overlayZIndex={dialogOpen ? TOUR_Z_UNDER_DIALOG : TOUR_Z}
        >
          {null}
        </NextStep>
      </MotionConfig>
    </TourContext.Provider>
  );
}

export function TourProvider({ children }: { children: ReactNode }) {
  return (
    <NextStepProvider>
      <TourController>{children}</TourController>
    </NextStepProvider>
  );
}
