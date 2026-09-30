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

function TourController({ children }: { children: ReactNode }) {
  const userId = useAuthStore((s) => s.user?.id);
  const router = useRouter();
  const pathname = usePathname();
  const { startNextStep, closeNextStep, currentTour, isNextStepVisible } = useNextStep();
  const [active, setActive] = useState<ActiveTour[]>([]);
  const pending = useRef<TourName | null>(null);
  const live = useRef({ currentTour, isNextStepVisible, startNextStep, closeNextStep });
  live.current = { currentTour, isNextStepVisible, startNextStep, closeNextStep };

  useEffect(() => {
    if (!pending.current) return;
    const name = pending.current;
    pending.current = null;
    live.current.startNextStep(name);
  }, [active]);

  const begin = useCallback(
    (name: TourName) => {
      if (!userId) return false;
      const steps = resolveTour(name);
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

  const api = useMemo(() => ({ startOnce, close, replay }), [startOnce, close, replay]);
  const reduce = useReducedMotion();

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
          disableConsoleLogs
          noInViewScroll={false}
          scrollToTop={false}
          overlayZIndex={10000}
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
