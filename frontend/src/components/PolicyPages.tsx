import React, { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";

import { LegalBlock, LegalDocument, PRIVACY_POLICY, TERMS_OF_SERVICE } from "@/content/legal";

const CONTACT_EMAIL = "spirit.monkeytech@gmail.com";

/** Text with the contact email made clickable. The wording itself is never changed. */
function withLinks(text: string): ReactNode {
  const parts = text.split(CONTACT_EMAIL);
  if (parts.length === 1) return text;
  return parts.flatMap((part, i) =>
    i === 0
      ? [part]
      : [
          <a key={i} href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>,
          part,
        ]
  );
}

/** "For our own website and clients: we decide…" -> the short lead-in before the colon is shown in bold. */
function ListText({ text }: { text: string }) {
  const colon = text.indexOf(": ");
  const lead = colon > 0 ? text.slice(0, colon) : "";
  if (!lead || lead.length > 45 || lead.includes(".")) return <>{withLinks(text)}</>;
  return (
    <>
      <strong className="font-semibold text-foreground">{lead}:</strong> {withLinks(text.slice(colon + 2))}
    </>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (block.type === "paragraph") {
    return <p className="text-[15px] leading-relaxed text-foreground/85">{withLinks(block.text)}</p>;
  }
  return (
    <ul className="space-y-2.5">
      {block.items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-foreground/85">
          <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
          <span>
            <ListText text={item} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function LegalPage({ doc, current }: { doc: LegalDocument; current: "privacy" | "terms" }) {
  return (
    <main className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <nav className="max-w-3xl mx-auto mb-8 flex items-center justify-between">
        <Link href="/chat" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>
        <a href="https://spirit-monkey.com" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Image src="/spirit-monkey-icon.png" alt="" width={28} height={28} />
          Spirit Monkey
        </a>
      </nav>

      <article className="max-w-3xl mx-auto rounded-2xl border border-border bg-card p-6 sm:p-10 shadow-sm">
        <header className="mb-8 border-b border-border pb-6">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">{doc.title}</h1>
          {doc.effective && <p className="mt-2 text-sm text-muted-foreground">{doc.effective}</p>}
          <div className="mt-5 space-y-3">
            {doc.intro.map((text, i) => (
              <p key={i} className="text-[15px] leading-relaxed text-foreground/85">
                {withLinks(text)}
              </p>
            ))}
          </div>
        </header>

        <div className="space-y-8">
          {doc.sections.map((section) => (
            <section key={section.heading} className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">{section.heading}</h2>
              {section.blocks.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </section>
          ))}
        </div>
      </article>

      <footer className="max-w-3xl mx-auto mt-8 flex justify-center gap-6 text-sm">
        <Link
          href="/privacy-policy"
          className={current === "privacy" ? "font-semibold text-primary" : "text-muted-foreground hover:text-primary"}
        >
          Privacy Policy
        </Link>
        <Link
          href="/terms-and-conditions"
          className={current === "terms" ? "font-semibold text-primary" : "text-muted-foreground hover:text-primary"}
        >
          Terms of Service
        </Link>
      </footer>
    </main>
  );
}

export function PrivacyPolicy() {
  return <LegalPage doc={PRIVACY_POLICY} current="privacy" />;
}

export function TermsAndConditions() {
  return <LegalPage doc={TERMS_OF_SERVICE} current="terms" />;
}
