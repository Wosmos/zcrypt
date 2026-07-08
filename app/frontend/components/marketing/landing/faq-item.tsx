"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { Accordion, AccordionItem, AccordionContent } from "@/components/ui/accordion";

export function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem
        value="faq"
        className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors duration-200 hover:border-[var(--color-border-hover)] data-[state=open]:border-cyan-500/40"
      >
        <AccordionPrimitive.Header className="flex">
          <AccordionPrimitive.Trigger className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
            <span className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
              {question}
            </span>
            {/* Plus that rotates into an × */}
            <span
              aria-hidden="true"
              className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center text-cyan-500 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[state=open]:rotate-45"
            >
              <span className="absolute h-px w-3 bg-current" />
              <span className="absolute h-3 w-px bg-current" />
            </span>
          </AccordionPrimitive.Trigger>
        </AccordionPrimitive.Header>

        <AccordionContent className="px-5 pb-5 pt-0 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          {answer}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
