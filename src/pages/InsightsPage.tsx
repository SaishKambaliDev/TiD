import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { formatDurationMinutes } from '../lib/format';
import type {
  DailyPlanRevisionDTO,
  DeadlineRiskAssessment,
  PersonalBehaviourProfileDTO,
  PersonalInsight,
} from '../shared/types';

export function InsightsPage() {
  const [insights, setInsights] = useState<PersonalInsight[]>([]);
  const [risks, setRisks] = useState<DeadlineRiskAssessment[]>([]);
  const [profile, setProfile] = useState<PersonalBehaviourProfileDTO | null>(
    null
  );
  const [revisions, setRevisions] = useState<DailyPlanRevisionDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getInsights().then((res) => {
      setInsights(res.insights);
      setRisks(res.risks);
      setProfile(res.profile);
      setRevisions(res.revisions);
      setLoading(false);
    });
  }, []);

  return (
    <Layout notifications={risks}>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#1F2421]">
            My Insights
          </h1>
          <p className="text-sm text-[#5C645E]">
            Evidence-backed observations from completed work, calibration correlations, and schedule revisions.
          </p>
        </div>

        {loading ? (
          <div className="h-48 bg-white rounded-2xl border border-[#1F2421]/10 animate-pulse" />
        ) : (
          <>
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {insights.length === 0 ? (
                <div className="md:col-span-2 bg-white rounded-2xl border border-[#1F2421]/10 p-6 text-sm text-[#5C645E]">
                  Not enough completed task observations yet. Complete at least 2 tasks in any category to generate grounded insights.
                </div>
              ) : (
                insights.map((ins) => (
                  <div
                    key={ins.id}
                    className="bg-white rounded-2xl border border-[#1F2421]/10 p-5"
                  >
                    <div className="text-xs font-medium text-[#58438A]">
                      {ins.title} · {ins.uncertaintyLabel}
                    </div>
                    <p className="text-sm font-medium text-[#1F2421] mt-1.5">
                      {ins.statement}
                    </p>
                    <div className="text-xs font-mono tabular-nums text-[#5C645E] mt-2">
                      Based on {ins.observationCount} recorded observations
                    </div>
                  </div>
                ))
              )}
            </section>

            {/* Calibration vs Outcome Correlations */}
            <section className="bg-white rounded-2xl border border-[#1F2421]/10 p-5">
              <h2 className="font-display text-base font-semibold text-[#1F2421] mb-3">
                Daily calibration correlations (exploratory)
              </h2>
              {!profile || profile.calibrationCorrelations.length === 0 ? (
                <p className="text-xs text-[#5C645E]">
                  No calibration-to-completion pairs observed yet. Self-reported energy never mutates permanent traits automatically.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {profile.calibrationCorrelations.map((c) => (
                    <div
                      key={c.energyLevel}
                      className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#1F2421]/10 text-xs"
                    >
                      <div className="font-semibold text-[#1F2421]">
                        {c.energyLevel.replace(/_/g, ' ')}
                      </div>
                      <div className="font-mono tabular-nums text-[#5C645E] mt-1">
                        Avg actual/est ratio: {c.avgActualVsEstRatio}x ·{' '}
                        {c.observationCount} obs
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Deadline Risk Forecast */}
            <section className="bg-white rounded-2xl border border-[#1F2421]/10 p-5">
              <h2 className="font-display text-base font-semibold text-[#1F2421] mb-3">
                Deadline risk outlook
              </h2>
              {risks.length === 0 ? (
                <p className="text-xs text-[#5C645E]">
                  No open tasks with deadlines right now.
                </p>
              ) : (
                <div className="divide-y divide-[#1F2421]/5 text-xs">
                  {risks.map((r) => (
                    <div
                      key={r.taskId}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-semibold text-[#1F2421]">
                          {r.title}
                        </div>
                        <div className="text-[#5C645E] mt-0.5">
                          {r.explanation}
                        </div>
                      </div>
                      <div className="font-mono tabular-nums shrink-0 text-right">
                        <span
                          className={
                            r.riskLevel === 'critical'
                              ? 'text-[#AD5134] font-semibold'
                              : r.riskLevel === 'high'
                                ? 'text-[#7A5C12] font-semibold'
                                : 'text-[#296345]'
                          }
                        >
                          {r.riskLevel.toUpperCase()} ·{' '}
                          {Math.round(r.completionProbability * 100)}% prob
                        </span>
                        <div className="text-[#838A84]">
                          Posterior req: {formatDurationMinutes(r.requiredMinutesPosterior)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Plan Revisions Comparison */}
            <section className="bg-white rounded-2xl border border-[#1F2421]/10 p-5">
              <h2 className="font-display text-base font-semibold text-[#1F2421] mb-3">
                Planned vs recalibrated revisions
              </h2>
              {revisions.length === 0 ? (
                <p className="text-xs text-[#5C645E]">
                  No daily plan revisions recorded yet.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {revisions.slice(0, 8).map((rev) => (
                    <div
                      key={rev.id}
                      className="p-3 rounded-xl bg-[#FAF8F5] border border-[#1F2421]/10 text-xs flex items-center justify-between gap-3"
                    >
                      <div>
                        <span className="font-semibold text-[#1F2421]">
                          {rev.date} · Rev #{rev.revisionNumber}
                        </span>{' '}
                        <span className="text-[#5C645E]">
                          ({rev.triggerReason.replace('_', ' ')})
                        </span>
                        <div className="text-[#5C645E] mt-0.5">
                          {rev.diffSummary.join(' ')}
                        </div>
                      </div>
                      <span className="font-mono tabular-nums text-[#58438A] shrink-0">
                        {formatDurationMinutes(
                          rev.capacityBreakdownSnapshot.scheduledTaskMinutes
                        )}{' '}
                        planned
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
