import { HardHat, Wrench, Boxes, Sparkles, Gauge, FileCode2, Eye } from 'lucide-react';

export function Buildbay() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <HardHat className="h-5 w-5" />
          Buildbay
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          AutoClaude for VEX robotics CAD. Spec a mechanism, get a parametric assembly.
        </p>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-8 space-y-8">
          {/* Hero */}
          <div className="rounded-xl border border-border bg-gradient-to-br from-amber-500/5 via-card to-card p-6">
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-amber-500/10 p-3">
                <HardHat className="h-7 w-7 text-amber-500" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">From spec to assembly</h2>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Describe a mechanism in plain language — &quot;4-motor tank drive on 4&quot; omni wheels, 1:1
                  with V5 smart motors&quot; — and Buildbay produces a parametric OnShape assembly,
                  a parts list pulled from the VEX catalog, and a sim-checked feasibility report.
                </p>
                <div className="mt-3 text-[11px] uppercase tracking-wider text-amber-500/80">
                  Coming soon — currently a placeholder
                </div>
              </div>
            </div>
          </div>

          {/* Planned pipeline */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Planned pipeline</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <PipelineCard
                icon={Sparkles}
                phase="Spec"
                title="Mechanism intent"
                body="LLM interrogates: drivetrain vs. lift vs. intake? motor count + budget? target stall torque?"
              />
              <PipelineCard
                icon={Boxes}
                phase="Parts"
                title="Catalog lookup"
                body="Pick from the canonical VEX V5 / VEX Pro catalog. Validates compatibility (shaft sizes, hole patterns, gear pitches)."
              />
              <PipelineCard
                icon={FileCode2}
                phase="CAD"
                title="FeatureScript generation"
                body="Emits OnShape FeatureScript / Fusion Python that imports parts and applies mates. Code-shaped surface for LLM."
              />
              <PipelineCard
                icon={Gauge}
                phase="Validate"
                title="Headless sim"
                body="Mate solve + collision check + mass/torque budget. Failed assemblies feed back into the spec loop."
              />
            </div>
          </section>

          {/* Why */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Why VEX before general CAD</h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex gap-2">
                <span className="text-amber-500">•</span>
                <span><strong className="text-foreground">Closed catalog.</strong> Parts come from a known set. LLMs are reliable in bounded search spaces and fall over in unbounded ones.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-500">•</span>
                <span><strong className="text-foreground">Code-shaped CAD.</strong> OnShape FeatureScript is a typed parametric language — plays to LLM strengths instead of asking for raw 3D reasoning.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-500">•</span>
                <span><strong className="text-foreground">Cheap eval loop.</strong> Mate-resolve + bounding-box collision is enough to catch most LLM hallucinations before a student touches a wrench.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-500">•</span>
                <span><strong className="text-foreground">Real users.</strong> VEX teams burn nights on iteration; faster CAD = more shop time on the actual robot.</span>
              </li>
            </ul>
          </section>

          {/* Footer / call to action */}
          <section className="rounded-lg border border-dashed border-border p-4 flex items-start gap-3">
            <Wrench className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="text-xs text-muted-foreground">
              <p>
                <strong className="text-foreground">Not built yet.</strong> Buildbay is reserved as a placeholder
                tab so the surface exists. The real wedge is the OnShape API integration + validator.
              </p>
              <p className="mt-1">
                Configure your OnShape API key under <em>Settings → Connectors</em> once that connector
                is added. Until then this tab is a roadmap.
              </p>
            </div>
            <Eye className="h-5 w-5 text-muted-foreground/40 shrink-0 self-end" />
          </section>
        </div>
      </div>
    </div>
  );
}

function PipelineCard({
  icon: Icon,
  phase,
  title,
  body,
}: {
  icon: React.ElementType;
  phase: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-amber-500/80" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{phase}</span>
      </div>
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground leading-relaxed">{body}</div>
    </div>
  );
}
