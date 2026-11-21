import React from "react";
import Link from "next/link";
import { ReactNode } from "react";

const PolicyLayout = ({ children }: { children: ReactNode }) => {
  return (
    <main className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-navy-950 text-white transition-colors duration-200">
      <nav className="max-w-4xl mx-auto mb-8">
        <Link
          href="/chat"
          className="inline-flex items-center text-sm text-zinc-400 hover:text-brand-500 transition-colors duration-200"
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>
      </nav>
      <div className="max-w-4xl mx-auto">
        <div className="bg-navy-950 border border-zinc-800 shadow-2xl rounded-2xl backdrop-blur-sm overflow-hidden">
          <div className="p-8 md:p-12">{children}</div>
        </div>
      </div>
      <footer className="max-w-4xl mx-auto mt-8 text-center text-sm text-zinc-500">
        <div className="flex justify-center space-x-6">
          <Link
            href="/privacy-policy"
            className="hover:text-brand-500 transition-colors duration-200"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms-and-conditions"
            className="hover:text-brand-500 transition-colors duration-200"
          >
            Terms & Conditions
          </Link>
        </div>
      </footer>
    </main>
  );
};

const SectionHeader = ({ children }: { children: ReactNode }) => (
  <h2 className="text-xl font-bold text-zinc-100 mt-12 mb-6 pb-2 border-b border-zinc-800 flex items-center gap-2">
    <span className="w-1 h-5 bg-brand-500 rounded-full" />
    {children}
  </h2>
);

const ListItem = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <li className="flex gap-3 text-zinc-300 leading-relaxed text-sm">
    <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-brand-500 mt-2" />
    <div>
      {title && (
        <strong className="text-zinc-100 font-semibold">{title}</strong>
      )}{" "}
      {children}
    </div>
  </li>
);

export function PrivacyPolicy() {
  return (
    <PolicyLayout>
      <div className="prose prose-invert max-w-none">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-brand-500 mb-4 tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-xs text-zinc-500 font-mono">
            Last Updated: March 2026
          </p>
        </div>

        <SectionHeader>1. Scope & 100% Local Execution</SectionHeader>
        <p className="text-zinc-300 leading-relaxed text-sm">
          Fagoon AI is a 100% self-hosted, local open-source package. There is no cloud hosting, centralized servers, or remote databases managed by the developers. When you download this package from GitHub or package registries:
        </p>
        <ul className="space-y-3 mt-4">
          <ListItem title="Zero Telemetry:">
            We do not collect, monitor, log, or track any metrics, prompts, workflows, files, or usage diagnostics. We have zero visibility into your application or user interactions.
          </ListItem>
          <ListItem title="Local Storage:">
            All database tables, vector embeddings (PGVector), conversational logs, credentials, and configuration files reside strictly within your self-hosted infrastructure or local machine.
          </ListItem>
        </ul>

        <SectionHeader>2. Third-Party Integrations</SectionHeader>
        <p className="text-zinc-300 leading-relaxed text-sm mb-4">
          While this software runs completely locally, it integrates with external API services (such as OpenAI, Google Gemini, Anthropic, ElevenLabs, E2B) to execute specific nodes:
        </p>
        <ul className="space-y-4">
          <ListItem title="API Communication:">
            The package communicates directly from your local machine/server to these external provider APIs using the API keys you provide in your local environment configurations (`.env`).
          </ListItem>
          <ListItem title="Data Sharing:">
            Any prompt or document uploaded is transmitted only to the specific third-party providers configured by you. We encourage you to review the privacy policies of each third-party provider you integrate.
          </ListItem>
        </ul>

        <SectionHeader>3. Data Security & Key Protection</SectionHeader>
        <p className="text-zinc-300 leading-relaxed text-sm">
          Since the application runs locally under your control, the security of the setup is your responsibility:
        </p>
        <ul className="space-y-4 mt-4">
          <ListItem title="Environment Files:">
            Rigorously protect your `.env` files and local configuration databases to prevent key exposure.
          </ListItem>
          <ListItem title="GCS Bucket & DB Access:">
            Configure secure access rules (IAM, Firestore rules, PGVector SSL) to restrict unauthorized public writes to your custom storage buckets.
          </ListItem>
        </ul>

        <SectionHeader>4. Contact Us</SectionHeader>
        <p className="text-zinc-300 leading-relaxed text-sm">
          For any open-source inquiries, security disclosures, or collaboration questions, please contact the maintainers at:{" "}
          <a
            href="mailto:admin@fagoondigital.com"
            className="text-brand-500 hover:underline transition-colors duration-200"
          >
            admin@fagoondigital.com
          </a>
        </p>
      </div>
    </PolicyLayout>
  );
}

export function TermsAndConditions() {
  return (
    <PolicyLayout>
      <div className="prose prose-invert max-w-none">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-brand-500 mb-4 tracking-tight">
            Terms and Conditions
          </h1>
          <p className="text-xs text-zinc-500 font-mono">
            Last Updated: March 2026
          </p>
        </div>

        <SectionHeader>1. Nature of Open Source Package</SectionHeader>
        <p className="text-zinc-300 leading-relaxed text-sm">
          These Terms and Conditions govern the download, modification, and local use of the Fagoon AI open-source package. By downloading this software from GitHub or any other source registry, you agree to these Terms. If you do not agree, please delete all files and packages immediately.
        </p>

        <SectionHeader>2. Code License & Trademark Use</SectionHeader>
        <p className="text-zinc-300 leading-relaxed text-sm">
          Fagoon AI is committed to open code, but we protect our project identity:
        </p>
        <ul className="space-y-4 mt-4">
          <ListItem title="License Model:">
            The core code is licensed under the open-source license provided in the root `LICENSE` file. You are permitted to modify, fork, and distribute it in accordance with that license.
          </ListItem>
          <ListItem title="Trademark Restriction:">
            You must not use the name &quot;Fagoon AI&quot;, logo, or visual identity to distribute malicious clones, scam versions, or unauthorized paid services that mislead the public regarding official project backing.
          </ListItem>
        </ul>

        <SectionHeader>3. User-Hosted Security & Liability</SectionHeader>
        <p className="text-zinc-300 leading-relaxed text-sm">
          Because the package is hosted and maintained entirely by you, we enforce strict disclaimers regarding operational abuse:
        </p>
        <ul className="space-y-4 mt-4">
          <ListItem title="Airtight Key Protection:">
            You are solely responsible for securing your environment API keys and Postgres credentials. Any unauthorized access, data loss, or credit draining on your external API accounts is entirely your liability.
          </ListItem>
          <ListItem title="Safe Deployment:">
            Do not run the codebase with insecure, publicly writeable file uploads, or bypassed authentication middleware. Maintain secure access boundaries on your deployed servers to prevent malicious web exploits (XSS, SQL Injection).
          </ListItem>
        </ul>

        <SectionHeader>4. Total Disclaimer of Warranties & Liability (Legally Binding)</SectionHeader>
        <p className="text-zinc-300 leading-relaxed text-sm font-mono bg-zinc-950/40 p-4 rounded-lg border border-zinc-800/60">
          THE SOFTWARE IS PROVIDED &quot;AS-IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS, PROJECT MAINTAINERS, OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, LOSS OF DATA, FINANCIAL DRAINING, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
        </p>

        <SectionHeader>5. Contact Information</SectionHeader>
        <p className="text-zinc-300 leading-relaxed text-sm">
          For project inquiries, security disclosures, or other open-source collaborations, contact the maintainers at:{" "}
          <a
            href="mailto:admin@fagoondigital.com"
            className="text-brand-500 hover:underline transition-colors duration-200"
          >
            admin@fagoondigital.com
          </a>
        </p>
      </div>
    </PolicyLayout>
  );
}
