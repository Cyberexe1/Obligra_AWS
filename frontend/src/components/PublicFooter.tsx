const FOOTER_COLUMNS = [
  {
    title: 'Product',
    links: ['Obligation Engine', 'Contract Extraction', 'Workflow Triggers', 'Integrations'],
  },
  {
    title: 'Resources',
    links: ['Documentation', 'Trust & Security', 'API Reference', 'Case Studies'],
  },
  {
    title: 'Company',
    links: ['About Obligra', 'Careers', 'Press', 'Contact'],
  },
]

/**
 * Rounded floating footer used on the public landing page, matching the
 * Stitch design's footer spec: brand column + 3 link columns + legal bar.
 * Links are placeholders (the Stitch source links to "#") since none of
 * these destination pages exist yet — not a functional regression, the
 * original design has no working destinations for them either.
 */
export default function PublicFooter() {
  return (
    <div className="relative z-10 mt-20 px-4 pb-8 sm:px-6">
      <footer className="mx-auto max-w-7xl rounded-[32px] bg-surface-container-lowest/90 px-8 py-16 shadow-[0_4px_30px_-6px_rgba(15,23,42,0.05),0_1px_3px_rgba(15,23,42,0.03)] backdrop-blur-xl sm:px-12">
        <div className="grid grid-cols-1 gap-12 pb-14 md:grid-cols-12">
          <div className="flex flex-col items-start md:col-span-5">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="material-symbols-outlined text-[18px] text-on-primary">verified_user</span>
              </div>
              <span className="font-headline-sm text-headline-sm font-bold tracking-tight text-primary">OBLIGRA</span>
            </div>
            <p className="mb-6 max-w-sm font-body-md text-body-md text-on-surface-variant">
              AI-powered intelligence for everything you&rsquo;re obligated to do. Proactive governance, continuous
              clause discovery, and mission-critical execution.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 md:col-span-7">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title} className="flex flex-col gap-3">
                <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface">
                  {column.title}
                </span>
                {column.links.map((link) => (
                  <a
                    key={link}
                    href="#"
                    className="font-body-sm text-body-sm text-on-surface-variant transition-colors hover:text-on-surface"
                  >
                    {link}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 pt-8 sm:flex-row">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            &copy; {new Date().getFullYear()} OBLIGRA Technologies Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="font-body-sm text-body-sm text-on-surface-variant transition-colors hover:text-on-surface">
              Privacy Policy
            </a>
            <a href="#" className="font-body-sm text-body-sm text-on-surface-variant transition-colors hover:text-on-surface">
              Terms of Service
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
