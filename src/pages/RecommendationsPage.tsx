import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import type { DeadlineRiskAssessment, RecommendationItem } from '../shared/types';

export function RecommendationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [risks, setRisks] = useState<DeadlineRiskAssessment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await api.getRecommendations();
    setItems(res.recommendations);
    setRisks(res.risks);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleApply = async (rec: RecommendationItem) => {
    if (rec.payload.route) {
      navigate(rec.payload.route as string);
      return;
    }
    await api.applyRecommendation(rec.id, rec.payload);
    load();
  };

  const handleDismiss = async (rec: RecommendationItem) => {
    await api.dismissRecommendation(rec.id);
    setItems((prev) => prev.filter((x) => x.id !== rec.id));
  };

  return (
    <Layout notifications={risks}>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#1F2421]">
            Recommendations
          </h1>
          <p className="text-sm text-[#5C645E]">
            Transparent suggestions combining your daily calibration, Bayesian effort posteriors, and capacity constraints.
          </p>
        </div>

        {loading ? (
          <div className="h-44 bg-white rounded-2xl border border-[#1F2421]/10 animate-pulse" />
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#1F2421]/10 p-8 text-center text-sm text-[#5C645E]">
            No pending recommendations right now. Your schedule and deadlines look balanced.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((rec) => (
              <div
                key={rec.id}
                className="bg-white rounded-2xl border border-[#1F2421]/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="font-display text-base font-semibold text-[#1F2421]">
                    {rec.title}
                  </div>
                  <p className="text-sm text-[#5C645E]">{rec.rationale}</p>
                  <div className="text-xs font-mono text-[#58438A]">
                    Evidence: {rec.evidenceSummary}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDismiss(rec)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-[#1F2421]/10 text-xs text-[#5C645E] hover:bg-[#FAF8F5]"
                  >
                    <X className="w-3.5 h-3.5" /> Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApply(rec)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1F2421] text-white text-xs font-medium hover:bg-[#333A36]"
                  >
                    <Check className="w-3.5 h-3.5" /> {rec.actionLabel}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
