import { Link } from 'react-router-dom'
import PublicFooter from '../components/PublicFooter'
import PublicHeader from '../components/PublicHeader'

/**
 * Public marketing landing page at `/`, reproducing the Stitch-generated
 * OBLIGRA design (see `stitch__landing_page (1)/`) as closely as
 * possible: rounded floating header, hero with ambient gradients and a
 * dashboard preview mockup, a 4-step "how it works" section, a
 * graph-vs-to-do comparison section, a final CTA panel, and a rounded
 * footer. All CTAs route to the real signup/login pages instead of the
 * Stitch source's placeholder `href="#"` anchors.
 */
export default function Landing() {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-surface font-body-md text-body-md text-on-surface antialiased">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-20%] h-[600px] w-[1000px] -translate-x-1/2 rounded-full bg-gradient-to-b from-secondary-fixed/40 via-tertiary-fixed/20 to-transparent opacity-70 blur-[120px]" />
        <div className="absolute left-[-10%] top-[40%] h-[600px] w-[600px] rounded-full bg-secondary-fixed-dim/20 opacity-50 blur-[140px]" />
        <div className="absolute bottom-[10%] right-[-10%] h-[650px] w-[650px] rounded-full bg-primary-fixed/30 opacity-50 blur-[150px]" />
      </div>

      <PublicHeader />

      <main className="relative z-10 w-full pt-20">
        <HeroSection />
        <HowItWorksSection />
        <GraphVsToDoSection />
        <FinalCtaSection />
      </main>

      <PublicFooter />
    </div>
  )
}

function HeroSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6 sm:pb-28 lg:px-8">
      <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-surface-container-lowest px-3.5 py-1.5 shadow-[0_2px_12px_rgba(33,112,228,0.08)] transition-transform duration-200 hover:scale-105">
          <span className="h-2 w-2 animate-pulse rounded-full bg-secondary" />
          <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-secondary">
            ✨ AI-Powered Obligation Intelligence
          </span>
        </div>

        <h1 className="font-display text-4xl font-bold tracking-tight text-on-surface sm:text-5xl lg:text-[58px] lg:leading-[66px]">
          Turn scattered information into a plan before it becomes a problem.
        </h1>

        <p className="mt-6 max-w-2xl font-body-lg text-body-lg leading-relaxed text-on-surface-variant">
          OBLIGRA understands deadlines, dependencies, conditions, and risks hidden inside the chaotic messages,
          documents, and screenshots you receive every day.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 sm:mt-10">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 font-title-md text-title-md text-on-primary shadow-lg shadow-primary/10 transition-all hover:scale-[1.02] hover:bg-primary-container active:scale-[0.98]"
          >
            <span>Get Started</span>
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 rounded-full bg-surface-container-lowest px-7 py-3.5 font-title-md text-title-md text-on-surface shadow-sm transition-all hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[20px] text-secondary">play_circle</span>
            <span>See how it works</span>
          </a>
        </div>

        <div className="mt-8 flex items-center justify-center gap-6 text-on-surface-variant sm:gap-10">
          <div className="flex items-center gap-2">
            <span className="font-headline-sm text-headline-sm font-bold text-on-surface">99.4%</span>
            <span className="font-label-sm text-label-sm uppercase tracking-wide">Extraction Precision</span>
          </div>
          <div className="h-1 w-1 rounded-full bg-outline-variant" />
          <div className="flex items-center gap-2">
            <span className="font-headline-sm text-headline-sm font-bold text-on-surface">&lt; 1.2s</span>
            <span className="font-label-sm text-label-sm uppercase tracking-wide">Clause Inference</span>
          </div>
          <div className="hidden h-1 w-1 rounded-full bg-outline-variant sm:block" />
          <div className="hidden items-center gap-2 sm:flex">
            <span className="font-headline-sm text-headline-sm font-bold text-on-surface">Zero</span>
            <span className="font-label-sm text-label-sm uppercase tracking-wide">Silent Misses</span>
          </div>
        </div>
      </div>

      <DashboardPreviewMockup />
    </section>
  )
}

function DashboardPreviewMockup() {
  return (
    <div className="mx-auto mt-14 max-w-6xl overflow-hidden rounded-[28px] bg-surface-container-lowest shadow-[0_20px_60px_-15px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-container-low/70 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#f87171]" />
            <span className="h-3 w-3 rounded-full bg-[#fbbf24]" />
            <span className="h-3 w-3 rounded-full bg-[#34d399]" />
          </div>
          <div className="mx-1 h-4 w-px bg-outline-variant/40" />
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-ping rounded-full bg-secondary" />
            <span className="font-label-md text-label-md font-semibold text-on-surface">Live Extraction Pipeline</span>
            <span className="rounded-full bg-secondary-fixed px-2 py-0.5 font-label-sm text-label-sm text-on-secondary-fixed">
              Active Sync
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <span className="mr-1 font-label-sm text-label-sm font-medium text-on-surface-variant">Listening:</span>
          {[
            { icon: 'send', label: 'Telegram', color: '#229ed9', live: true },
            { icon: 'photo_camera', label: 'Screenshot', color: '#8b5cf6', live: true },
            { icon: 'picture_as_pdf', label: 'PDF / Contract', color: '#ef4444', live: false },
            { icon: 'edit_note', label: 'Raw Text', color: '#10b981', live: false },
          ].map((stream) => (
            <div key={stream.label} className="flex items-center gap-1.5 rounded-full bg-surface-container-lowest px-2.5 py-1 shadow-sm">
              <span className="material-symbols-outlined text-[15px]" style={{ color: stream.color }}>
                {stream.icon}
              </span>
              <span className="font-label-sm text-label-sm text-on-surface">{stream.label}</span>
              {stream.live && <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" />}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 bg-surface-container-lowest p-6 sm:p-8 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-5">
          <div className="flex flex-col gap-2 rounded-2xl bg-surface-container-low/60 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#229ed9]">forum</span>
                <span className="font-label-sm text-label-sm font-semibold uppercase text-on-surface-variant">
                  Incoming Stream #4829
                </span>
              </div>
              <span className="font-body-sm text-body-sm text-on-surface-variant">42s ago</span>
            </div>
            <div className="rounded-xl bg-surface-container-lowest p-3 font-body-md text-body-md text-on-surface shadow-sm">
              &ldquo;Please sign{' '}
              <span className="rounded bg-secondary-fixed/50 px-1 py-0.5 font-semibold text-on-secondary-fixed">
                annexure B
              </span>{' '}
              before Friday 5pm otherwise{' '}
              <span className="rounded bg-error-container px-1 py-0.5 font-semibold text-on-error-container">
                lease handover is blocked
              </span>
              . Need Sarah to sign off first.&rdquo;
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl bg-surface-container-lowest p-5 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-secondary-fixed">
                  <span className="material-symbols-outlined text-[16px] text-secondary">auto_fix_high</span>
                </div>
                <span className="font-title-md text-title-md text-on-surface">Extracted Obligation Primitives</span>
              </div>
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-label-sm text-label-sm font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> 99.8% Conf.
              </span>
            </div>
            <div className="space-y-3">
              <div className="flex flex-col gap-1 rounded-xl bg-surface-container-low p-3">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                  Detected Obligation
                </span>
                <p className="font-title-md text-title-md font-semibold text-on-surface">
                  Execute Commercial Lease Annexure B
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1 rounded-xl bg-surface-container-low p-3">
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Deadline
                  </span>
                  <div className="inline-flex items-center gap-1.5 text-[#b45309]">
                    <span className="material-symbols-outlined text-[16px]">schedule</span>
                    <span className="font-label-md text-label-md font-semibold">Oct 24, 17:00</span>
                  </div>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">T-minus 46 hours</span>
                </div>
                <div className="flex flex-col gap-1 rounded-xl bg-surface-container-low p-3">
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Risk Level
                  </span>
                  <div className="inline-flex items-center gap-1.5 text-error">
                    <span className="material-symbols-outlined text-[16px]">crisis_alert</span>
                    <span className="font-label-md text-label-md font-semibold">Elevated / Blocker</span>
                  </div>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">Concession at risk</span>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl bg-surface-container-low p-3">
                <span className="material-symbols-outlined mt-0.5 text-[20px] text-secondary">account_tree</span>
                <div>
                  <span className="block font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Condition Precedent
                  </span>
                  <p className="font-body-md text-body-md font-medium text-on-surface">
                    Requires Legal Sign-off from <span className="font-semibold text-secondary">Sarah Chen</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-7">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col rounded-xl bg-surface-container-low p-3.5">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Active Obligations</span>
              <span className="mt-1 font-headline-md text-headline-md font-bold text-on-surface">14</span>
              <span className="mt-0.5 font-body-sm text-body-sm text-emerald-600">&uarr; 4 added today</span>
            </div>
            <div className="flex flex-col rounded-xl bg-surface-container-low p-3.5">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Critical Path Blockers</span>
              <span className="mt-1 font-headline-md text-headline-md font-bold text-error">3</span>
              <span className="mt-0.5 font-body-sm text-body-sm text-error/80">Action required</span>
            </div>
            <div className="flex flex-col rounded-xl bg-surface-container-low p-3.5">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Extraction Precision</span>
              <span className="mt-1 font-headline-md text-headline-md font-bold text-secondary">99.4%</span>
              <span className="mt-0.5 font-body-sm text-body-sm text-secondary/80">Across 47 models</span>
            </div>
          </div>

          <div className="relative flex min-h-[300px] flex-1 flex-col gap-3 overflow-hidden rounded-2xl bg-surface-container-low/80 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-title-md text-title-md font-semibold text-on-surface">Active Dependency Network</span>
                <span className="rounded-full bg-surface-container-lowest px-2 py-0.5 font-label-sm text-label-sm text-on-surface-variant">
                  Auto-mapped
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                  <span className="h-2 w-2 rounded-full bg-error" /> Critical
                </span>
                <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                  <span className="h-2 w-2 rounded-full bg-[#8b5cf6]" /> Dependent
                </span>
                <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                  <span className="h-2 w-2 rounded-full bg-secondary" /> Active
                </span>
              </div>
            </div>

            <div className="relative flex flex-1 flex-col justify-between gap-4 py-2">
              <div className="relative z-10 flex items-center justify-between gap-3">
                <div className="flex max-w-[210px] items-center gap-2.5 rounded-xl bg-surface-container-lowest px-3.5 py-2.5 shadow-md">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#229ed9]/15 text-[#229ed9]">
                    <span className="material-symbols-outlined text-[16px]">forum</span>
                  </div>
                  <div>
                    <span className="block font-label-sm text-label-sm text-on-surface-variant">Source Stream</span>
                    <span className="block truncate font-body-md text-body-md font-semibold text-on-surface">
                      Telegram Message
                    </span>
                  </div>
                </div>
                <div className="flex max-w-[230px] items-center gap-2.5 rounded-xl bg-surface-container-lowest px-3.5 py-2.5 shadow-md">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
                    <span className="material-symbols-outlined text-[16px]">verified</span>
                  </div>
                  <div>
                    <span className="block font-label-sm text-label-sm text-on-surface-variant">Compliance</span>
                    <span className="font-body-md text-body-md font-semibold text-on-surface">Verify Clause 4.2</span>
                  </div>
                </div>
              </div>

              <div className="relative z-10 my-2 flex justify-center">
                <div className="flex items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-on-primary shadow-xl">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-on-primary/20">
                    <span className="material-symbols-outlined text-[18px]">hub</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-secondary-fixed">
                        Extracted Task
                      </span>
                      <span className="rounded bg-error px-1.5 py-0.5 font-label-sm text-label-sm text-on-error">
                        High Priority
                      </span>
                    </div>
                    <p className="font-title-md text-title-md font-bold text-on-primary">Sign Annexure B</p>
                  </div>
                  <span className="material-symbols-outlined ml-1 text-[20px] text-secondary-fixed">sync_alt</span>
                </div>
              </div>

              <div className="relative z-10 flex items-center justify-end">
                <div className="flex max-w-[320px] items-center gap-3 rounded-xl bg-error-container px-4 py-3 text-on-error-container shadow-md">
                  <span className="material-symbols-outlined text-[20px] text-error">lock</span>
                  <div>
                    <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-error">
                      Blocked Consequence
                    </span>
                    <p className="font-body-md text-body-md font-bold text-on-error-container">
                      Commercial Lease Handover
                    </p>
                    <span className="font-body-sm text-body-sm font-medium text-error">
                      Dependent on Sarah Chen Legal Approval
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const HOW_IT_WORKS_STEPS = [
  {
    step: 'Step 01',
    title: 'Capture',
    description: 'Bring information from anywhere. Forward chats, drop PDFs, or screenshot an email thread.',
    icon: 'downloading',
    iconBg: 'bg-secondary-fixed/50 text-secondary',
    detail: (
      <div className="flex flex-col gap-2 rounded-2xl bg-surface-container-low p-3.5">
        <span className="font-label-sm text-label-sm font-medium text-on-surface-variant">Supported Streams:</span>
        <div className="flex flex-wrap gap-1.5">
          {['📄 PDF', '📷 Screenshot', '💬 Telegram', '📝 Text', '✉️ Email'].map((item) => (
            <span
              key={item}
              className="flex items-center gap-1 rounded-full bg-surface-container-lowest px-2.5 py-1 font-label-sm text-label-sm text-on-surface shadow-sm"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    step: 'Step 02',
    title: 'Understand',
    description: 'AI extracts what actually matters: not just keywords, but hard legal and operational primitives.',
    icon: 'psychology',
    iconBg: 'bg-primary-fixed text-on-primary-fixed',
    detail: (
      <div className="flex flex-col gap-2 rounded-2xl bg-surface-container-low p-3.5">
        <span className="font-label-sm text-label-sm font-medium text-on-surface-variant">Extracted Primitives:</span>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: '[Action]', dot: 'bg-blue-500' },
            { label: '[Deadline]', dot: 'bg-amber-500' },
            { label: '[Condition]', dot: 'bg-purple-500' },
            { label: '[Consequence]', dot: 'bg-rose-500' },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-1 rounded-lg bg-surface-container-lowest px-2.5 py-1 font-label-sm text-label-sm font-semibold text-on-surface shadow-sm"
            >
              <span className={['h-2 w-2 rounded-full', item.dot].join(' ')} />
              {item.label}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    step: 'Step 03',
    title: 'Connect',
    description: 'Discover what depends on what. Build continuous graphs of cascading prerequisites across silos.',
    icon: 'schema',
    iconBg: 'bg-tertiary-fixed text-on-tertiary-fixed',
    detail: (
      <div className="flex flex-col gap-2 rounded-2xl bg-surface-container-low p-3.5">
        <span className="font-label-sm text-label-sm font-medium text-on-surface-variant">Relational Graph:</span>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between rounded-lg bg-surface-container-lowest px-2 py-1 font-label-sm text-label-sm text-on-surface shadow-sm">
            <span>Dependencies</span>
            <span className="font-semibold text-secondary">A &rarr; B &rarr; C</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-surface-container-lowest px-2 py-1 font-label-sm text-label-sm text-on-surface shadow-sm">
            <span>Blocked Tasks</span>
            <span className="font-semibold text-error">3 Pending</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-surface-container-lowest px-2 py-1 font-label-sm text-label-sm text-on-surface shadow-sm">
            <span>Critical Chains</span>
            <span className="font-semibold text-on-surface">Auto-Resolved</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    step: 'Step 04',
    title: 'Act',
    description: 'Know what needs attention first. Execute prioritized tasks based on compounding downside risk.',
    icon: 'task_alt',
    iconBg: 'bg-secondary-fixed text-secondary',
    detail: (
      <div className="flex flex-col gap-2 rounded-2xl bg-surface-container-low p-3.5">
        <span className="font-label-sm text-label-sm font-medium text-on-surface-variant">Execution Telemetry:</span>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between font-label-sm text-label-sm">
            <span className="text-on-surface-variant">Priority Matrix</span>
            <span className="font-semibold text-on-surface">P0 (Critical)</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
            <div className="h-1.5 w-[85%] rounded-full bg-error" />
          </div>
          <div className="flex items-center justify-between pt-1 font-label-sm text-label-sm">
            <span className="text-on-surface-variant">Next Best Action</span>
            <span className="font-semibold text-secondary">Trigger Approval</span>
          </div>
        </div>
      </div>
    ),
  },
]

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto mb-16 max-w-3xl text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-surface-container-high px-3 py-1">
          <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
            Autonomous Lifecycle
          </span>
        </div>
        <h2 className="font-display text-3xl font-bold tracking-tight text-on-surface sm:text-4xl">
          From information to action.
        </h2>
        <p className="mt-4 font-body-lg text-body-lg text-on-surface-variant">
          OBLIGRA transforms unstructured, chaotic inputs into structured obligations, mapped dependencies, and
          prioritized operations.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {HOW_IT_WORKS_STEPS.map((item) => (
          <div
            key={item.step}
            className="group flex flex-col justify-between rounded-3xl bg-surface-container-lowest p-6 shadow-sm transition-all duration-300 hover:shadow-xl"
          >
            <div>
              <div className="mb-4 flex items-center justify-between">
                <span className="font-label-sm text-label-sm font-bold uppercase tracking-widest text-secondary">
                  {item.step}
                </span>
                <div className={['flex h-10 w-10 items-center justify-center rounded-2xl', item.iconBg].join(' ')}>
                  <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
                </div>
              </div>
              <h3 className="mb-2 font-title-md text-title-md font-bold text-on-surface">{item.title}</h3>
              <p className="mb-6 font-body-md text-body-md text-on-surface-variant">{item.description}</p>
            </div>
            {item.detail}
          </div>
        ))}
      </div>
    </section>
  )
}

const DEPENDENCY_NODES = [
  {
    icon: 'description',
    iconBg: 'bg-red-100 text-red-700',
    tag: 'PDF Source',
    status: { label: 'In Progress', className: 'bg-emerald-100 text-emerald-800' },
    title: 'Submit Regulatory Disclosure',
    subtitle: 'Annual Compliance Filing §14-A',
    due: { label: 'Due: Oct 28', className: 'bg-amber-100 text-amber-800' },
    meta: 'Lead: Legal Dept',
  },
  {
    icon: 'verified_user',
    iconBg: 'bg-purple-100 text-purple-700',
    tag: 'Screenshot',
    status: { label: 'Critical Path', className: 'bg-error text-on-error' },
    title: 'Vendor Security Signoff',
    subtitle: 'Mandatory SOC2 Appendix III confirmation',
    due: { label: 'Due: Oct 29', className: 'bg-rose-100 text-rose-800' },
    meta: 'Blocked by Node 1',
    metaClassName: 'text-error font-medium',
  },
  {
    icon: 'badge',
    iconBg: 'bg-blue-100 text-[#0058be]',
    tag: 'Telegram Chat',
    status: { label: 'Condition Met', className: 'bg-blue-100 text-blue-800' },
    title: 'HR Verification & Background',
    subtitle: 'Executive clearance confirmation',
    due: { label: 'Due: Nov 02', className: 'bg-surface-container-high text-on-surface' },
    meta: 'Verified',
    metaClassName: 'text-emerald-700 font-medium',
  },
  {
    icon: 'flag',
    iconBg: 'bg-primary text-on-primary',
    tag: 'Target Goal',
    status: { label: 'Condition Unmet', className: 'bg-amber-200 text-amber-900' },
    title: 'Final Joining & Provisioning',
    subtitle: 'Depends on Security Signoff (#2) & HR (#3)',
    due: { label: 'Target: Nov 05', className: 'bg-surface-container-lowest text-on-surface' },
    meta: 'Pending Unblock',
  },
]

const INTELLIGENCE_CARDS = [
  {
    icon: 'schedule',
    iconBg: 'bg-secondary-fixed/60 text-secondary',
    title: 'Deadline Intelligence',
    highlight: 'Know what is due and when.',
    highlightClassName: 'text-secondary',
    description:
      'Continuous calendar reconciliation across timezones, relative date expressions ("by next Friday end of day"), and conditional delivery triggers.',
  },
  {
    icon: 'account_tree',
    iconBg: 'bg-tertiary-fixed/60 text-on-tertiary-fixed',
    title: 'Dependency Intelligence',
    highlight: 'See what blocks what.',
    highlightClassName: 'text-secondary',
    description:
      'Live cross-document dependency graphs reveal invisible bottlenecks. When an upstream agreement stalls, downstream alerts update instantly.',
  },
  {
    icon: 'security',
    iconBg: 'bg-error-container text-error',
    title: 'Risk Intelligence',
    highlight: 'Detect obligations that could become problems.',
    highlightClassName: 'text-error',
    description:
      'Proactively flags penalty clauses, SLA forfeiture penalties, non-compliance fines, and bottleneck colleagues before deadlines expire.',
  },
  {
    icon: 'merge_type',
    iconBg: 'bg-surface-container-high text-on-surface',
    title: 'Conflict Detection',
    highlight: 'Spot conflicting deadlines and conditions.',
    highlightClassName: 'text-on-surface',
    description:
      'Multi-source arbitration detects when two parties cite contradictory cutoffs or mutually exclusive prerequisites, avoiding silent defaults.',
  },
]

function GraphVsToDoSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="mb-14 max-w-3xl">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-surface-container-high px-3 py-1">
          <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-secondary">
            Graph vs. To-Do
          </span>
        </div>
        <h2 className="font-display text-3xl font-bold tracking-tight text-on-surface sm:text-5xl">
          A task list tells you what to do. OBLIGRA tells you what depends on it.
        </h2>
        <p className="mt-4 font-body-lg text-body-lg text-on-surface-variant">
          Standard task managers treat every item as an isolated checklist entry. OBLIGRA constructs an active
          dependency graph that calculates collateral impacts, cascading delays, and legal liabilities.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-6 rounded-3xl bg-surface-container-lowest p-6 shadow-lg sm:p-8 lg:col-span-7">
          <div className="flex items-center justify-between pb-4">
            <div>
              <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-secondary">
                Visual Graph Explorer
              </span>
              <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                Cross-Document Dependency Mesh
              </h3>
            </div>
            <span className="rounded-full bg-surface-container-low px-3 py-1 font-label-sm text-label-sm font-medium text-on-surface-variant">
              4 Active Nodes
            </span>
          </div>

          <div className="flex flex-col gap-4 py-4">
            {DEPENDENCY_NODES.map((node, index) => (
              <div key={node.title}>
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-surface-container-low/70 p-4 shadow-sm transition-all hover:bg-surface-container-low">
                  <div className="flex items-start gap-3">
                    <div className={['flex h-10 w-10 items-center justify-center rounded-xl font-bold', node.iconBg].join(' ')}>
                      <span className="material-symbols-outlined text-[20px]">{node.icon}</span>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded bg-surface-container-lowest px-2 py-0.5 font-label-sm text-label-sm font-semibold text-on-surface">
                          {node.tag}
                        </span>
                        <span className={['rounded-full px-2 py-0.5 font-label-sm text-label-sm font-semibold', node.status.className].join(' ')}>
                          {node.status.label}
                        </span>
                      </div>
                      <h4 className="font-title-md text-title-md font-bold text-on-surface">{node.title}</h4>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{node.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end text-right">
                    <span className={['rounded-full px-2.5 py-1 font-label-sm text-label-sm font-semibold', node.due.className].join(' ')}>
                      {node.due.label}
                    </span>
                    <span className={['mt-1 font-body-sm text-body-sm text-on-surface-variant', node.metaClassName ?? ''].join(' ')}>
                      {node.meta}
                    </span>
                  </div>
                </div>
                {index < DEPENDENCY_NODES.length - 1 && (
                  <div className="my-[-8px] flex justify-center">
                    {index === 0 && (
                      <div className="flex items-center gap-1.5 rounded-full bg-error-container px-3 py-1 font-label-sm text-label-sm font-semibold text-on-error-container shadow-sm">
                        <span className="material-symbols-outlined text-[14px]">link_off</span>
                        <span>BLOCKED: Requires Node 1 Signoff</span>
                      </div>
                    )}
                    {index === 1 && (
                      <div className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-label-sm text-label-sm font-semibold text-on-secondary shadow-sm">
                        <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
                        <span>Converges into Final Provisioning</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-5">
          {INTELLIGENCE_CARDS.map((card) => (
            <div key={card.title} className="rounded-3xl bg-surface-container-lowest p-6 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-start gap-4">
                <div className={['flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', card.iconBg].join(' ')}>
                  <span className="material-symbols-outlined text-[24px]">{card.icon}</span>
                </div>
                <div>
                  <h3 className="mb-1 font-headline-sm text-headline-sm font-bold text-on-surface">{card.title}</h3>
                  <p className={['mb-2 font-title-md text-title-md font-semibold', card.highlightClassName].join(' ')}>
                    {card.highlight}
                  </p>
                  <p className="font-body-md text-body-md text-on-surface-variant">{card.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const VALUE_CARDS = [
  {
    icon: 'document_scanner',
    iconBg: 'bg-secondary-fixed/60 text-secondary',
    title: '1. Capture anything',
    description: 'Screenshots, documents, messages and text parsed with sub-second accuracy and contextual fidelity.',
  },
  {
    icon: 'psychology_alt',
    iconBg: 'bg-tertiary-fixed/60 text-on-tertiary-fixed',
    title: '2. Understand instantly',
    description: 'AI extracts actionable obligations, dates, prerequisites, conditions, and participating parties automatically.',
  },
  {
    icon: 'hub',
    iconBg: 'bg-primary-fixed text-on-primary-fixed',
    title: '3. See the bigger picture',
    description: 'Dependencies and risks mapped in one live graph so nothing falls through the cracks or creates liabilities.',
  },
]

function FinalCtaSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#f0f4ff] via-[#faf5ff] to-surface-container-lowest p-8 shadow-[0_20px_50px_-20px_rgba(33,112,228,0.12)] sm:p-14 lg:p-20">
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-secondary-fixed/40 blur-3xl" />

        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
          <div className="mb-6 flex items-center justify-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
              <span className="material-symbols-outlined text-[20px] text-on-primary">verified_user</span>
            </div>
            <span className="font-headline-sm text-headline-sm font-bold tracking-tight text-primary">OBLIGRA</span>
          </div>

          <h2 className="font-display text-3xl font-bold tracking-tight text-on-surface sm:text-5xl">
            Stop managing information.
            <br />
            Start managing what it requires.
          </h2>
          <p className="mt-6 max-w-2xl font-body-lg text-body-lg leading-relaxed text-on-surface-variant">
            OBLIGRA turns scattered instructions, messages, documents, and screenshots into one intelligent
            obligation system.
          </p>

          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row">
            <Link
              to="/signup"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 font-title-md text-title-md text-on-primary shadow-xl transition-all hover:scale-[1.02] hover:bg-primary-container active:scale-[0.98] sm:w-auto"
            >
              <span>Get Started</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
          </div>
          <p className="mt-4 font-label-md text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
            Understand. Connect. Act.
          </p>
        </div>

        <div className="relative z-10 mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
          {VALUE_CARDS.map((card) => (
            <div
              key={card.title}
              className="flex flex-col gap-3 rounded-2xl bg-surface-container-lowest/90 p-6 shadow-sm backdrop-blur-md"
            >
              <div className={['flex h-10 w-10 items-center justify-center rounded-xl', card.iconBg].join(' ')}>
                <span className="material-symbols-outlined text-[20px]">{card.icon}</span>
              </div>
              <h3 className="font-title-md text-title-md font-bold text-on-surface">{card.title}</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">{card.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
