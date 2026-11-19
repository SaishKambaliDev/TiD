import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { formatCategoryLabel } from '../lib/format';
import type { PersonalBehaviourProfileDTO, TaskEventDTO } from '../shared/types';

export function BehaviourPage() {
  const [profile, setProfile] = useState<PersonalBehaviourProfileDTO | null>(
    null
  );
  const [events, setEvents] = useState<TaskEventDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getBehaviour().then((res) => {
      setProfile(res.profile);
      setEvents(res.events);
      setLoading(false);
    });
  }, []);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#1F2421]">
            My Behaviour
          </h1>
          <p className="text-sm text-[#5C645E]">
            Personal Bayesian posteriors kept strictly separate from population priors, updated only from observed append-only task events.
          </p>
        </div>

        {loading || !profile ? (
          <div className="h-56 bg-white rounded-2xl border border-[#1F2421]/10 animate-pulse" />
        ) : (
          <>
            {/* Population Baseline vs Personal Summary */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-[#1F2421]/10 p-4">
                <div className="text-xs text-[#5C645E]">Population prior</div>
                <div className="font-mono tabular-nums text-lg font-semibold text-[#1F2421] mt-1">
                  {profile.populationPriors.defaultEffortMultiplier}x
                </div>
                <div className="text-[11px] text-[#838A84] mt-0.5">
                  Prior strength: {profile.populationPriors.priorStrength} pseudo-obs
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-[#1F2421]/10 p-4">
                <div className="text-xs text-[#5C645E]">Deadline consistency</div>
                <div className="font-mono tabular-nums text-lg font-semibold text-[#296345] mt-1">
                  {profile.deadlineSensitivity.onTimeCount} on-time /{' '}
                  {profile.deadlineSensitivity.lateCount} late
                </div>
                <div className="text-[11px] text-[#838A84] mt-0.5">
                  Last-minute rate: {Math.round(profile.deadlineSensitivity.lastMinuteRushRate * 100)}%
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-[#1F2421]/10 p-4">
                <div className="text-xs text-[#5C645E]">Task switches logged</div>
                <div className="font-mono tabular-nums text-lg font-semibold text-[#58438A] mt-1">
                  {profile.taskSwitchingCount}
                </div>
                <div className="text-[11px] text-[#838A84] mt-0.5">
                  Recorded during active sessions
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-[#1F2421]/10 p-4">
                <div className="text-xs text-[#5C645E]">Intervention response</div>
                <div className="font-mono tabular-nums text-lg font-semibold text-[#265D8A] mt-1">
                  {profile.recommendationAcceptedCount} accepted
                </div>
                <div className="text-[11px] text-[#838A84] mt-0.5">
                  {profile.recommendationDismissedCount} dismissed
                </div>
              </div>
            </section>

            {/* Category Posteriors Table */}
            <section className="bg-white rounded-2xl border border-[#1F2421]/10 p-5 overflow-x-auto">
              <h2 className="font-display text-base font-semibold text-[#1F2421] mb-3">
                Personal category effort posteriors
              </h2>
              {profile.categoryPosteriors.length === 0 ? (
                <p className="text-xs text-[#5C645E]">
                  No category observations yet. Every category starts from the population prior until you complete tasks.
                </p>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1F2421]/10 text-[#5C645E]">
                      <th className="py-2.5 pr-3">Category</th>
                      <th className="py-2.5 px-3 text-right">Observations</th>
                      <th className="py-2.5 px-3 text-right">Posterior multiplier</th>
                      <th className="py-2.5 px-3 text-right">Variance</th>
                      <th className="py-2.5 px-3 text-right">Uncertainty</th>
                      <th className="py-2.5 pl-3 text-right">Postponements</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2421]/5 font-mono tabular-nums">
                    {profile.categoryPosteriors.map((c) => (
                      <tr key={c.category}>
                        <td className="py-2.5 pr-3 font-sans font-medium text-[#1F2421]">
                          {formatCategoryLabel(c.category)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {c.observationCount}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[#58438A] font-semibold">
                          {c.posteriorMeanMultiplier}x
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {c.posteriorVariance}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {c.uncertaintyScore}
                        </td>
                        <td className="py-2.5 pl-3 text-right text-[#AD5134]">
                          {c.postponementCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* Append-Only Task Event Log */}
            <section className="bg-white rounded-2xl border border-[#1F2421]/10 p-5">
              <h2 className="font-display text-base font-semibold text-[#1F2421] mb-3">
                Append-only task event history
              </h2>
              {events.length === 0 ? (
                <p className="text-xs text-[#5C645E]">No events recorded yet.</p>
              ) : (
                <div className="divide-y divide-[#1F2421]/5 text-xs">
                  {events.slice(0, 20).map((ev) => (
                    <div
                      key={ev.id}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <div>
                        <span className="font-semibold text-[#1F2421]">
                          {ev.eventType.replace(/_/g, ' ')}
                        </span>
                        {ev.category && (
                          <span className="text-[#5C645E]">
                            {' '}
                            · {formatCategoryLabel(ev.category)}
                          </span>
                        )}
                        {ev.actualMinutes ? (
                          <span className="text-[#296345] font-mono tabular-nums">
                            {' '}
                            · actual {ev.actualMinutes}m
                          </span>
                        ) : null}
                      </div>
                      <span className="font-mono tabular-nums text-[#838A84] shrink-0">
                        {ev.localDate}
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
