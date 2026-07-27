
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, FileText, ChevronDown, ChevronUp, Loader2, CheckCircle2, Calendar, Download, RefreshCw } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { organizationService } from '../../services/organization.service';
import { PerformanceReview, ReviewCycle, CompetencyRating, OrgReviewConfig, CustomCompetency } from '../../types';
import CompetencyRatingCard from './CompetencyRatingCard';
import AttendanceLeaveCard from './AttendanceLeaveCard';
import ReviewStatusBadge from './ReviewStatusBadge';
import HelpButton from '../onboarding/HelpButton';
import {
  APP_NAME,
  PDF_COLORS,
  applyStandardTable,
  createPageBreakChecker,
  createPdfDocument,
  drawDocumentTitle,
  drawFormSection,
  drawReportFooters,
  drawReportHeader,
  drawSignatureBlock,
  formatGeneratedAt,
} from '../../utils/reportPdf';

interface Props {
  user: any;
  activeCycle: ReviewCycle | null;
  upcomingCycle?: ReviewCycle | null;
  myReview: PerformanceReview | null;
  pastReviews: PerformanceReview[];
  onRefresh: () => void;
  readOnly?: boolean;
  reviewConfig: OrgReviewConfig;
  cycles?: ReviewCycle[];
}

const EmployeeReviewModule: React.FC<Props> = ({ user, activeCycle, upcomingCycle, myReview, pastReviews, onRefresh, readOnly = false, reviewConfig, cycles }) => {
  const { t } = useTranslation('review');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);

  const competencies = reviewConfig.competencies;
  const ratingScale = reviewConfig.ratingScale.labels;

  const [ratings, setRatings] = useState<Record<string, { rating: number; comment: string }>>(() => {
    const initial: any = {};
    competencies.forEach(c => {
      const existing = myReview?.selfRatings.find(r => r.competencyId === c.id);
      initial[c.id] = {
        rating: existing?.rating || 0,
        comment: existing?.comment || '',
      };
    });
    return initial;
  });

  // Sync ratings state when competencies change (e.g. new competency added in settings)
  useEffect(() => {
    setRatings(prev => {
      const updated = { ...prev };
      let changed = false;
      competencies.forEach(c => {
        if (!(c.id in updated)) {
          const existing = myReview?.selfRatings.find(r => r.competencyId === c.id);
          updated[c.id] = { rating: existing?.rating || 0, comment: existing?.comment || '' };
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, [competencies, myReview]);

  const canSubmit = myReview?.status === 'DRAFT' && !readOnly;
  const allRated = competencies.every(c => ratings[c.id]?.rating > 0);

  const handleCreateAndOpen = async () => {
    if (!activeCycle || readOnly) return;
    setIsProcessing(true);
    try {
      const employees = await hrService.getEmployees();
      const me = employees.find((e: any) => e.id === user.id);
      const manager = me?.lineManagerId ? employees.find((e: any) => e.id === me.lineManagerId) : null;

      await hrService.createReview(
        activeCycle.id,
        user.id,
        user.name,
        me?.lineManagerId || manager?.id,
        manager?.name,
      );
      onRefresh();
    } catch (e) {
      console.error('Failed to create review:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async () => {
    if (!myReview || !canSubmit || !allRated) return;
    setIsProcessing(true);
    try {
      const selfRatings: CompetencyRating[] = competencies.map(c => ({
        competencyId: c.id,
        rating: ratings[c.id].rating,
        comment: ratings[c.id].comment,
      }));
      await hrService.submitSelfAssessment(myReview.id, selfRatings);
      onRefresh();
    } catch (e) {
      console.error('Failed to submit self-assessment:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const updateRating = (id: string, rating: number) => {
    setRatings(prev => ({ ...prev, [id]: { ...prev[id], rating } }));
  };

  const updateComment = (id: string, comment: string) => {
    setRatings(prev => ({ ...prev, [id]: { ...prev[id], comment } }));
  };

  const avgRating = (ratingsArr: CompetencyRating[]) => {
    const rated = ratingsArr.filter(r => r.rating > 0);
    if (rated.length === 0) return 0;
    return (rated.reduce((sum, r) => sum + r.rating, 0) / rated.length).toFixed(1);
  };

  // Resolve competency info: try org config first, then fall back for legacy IDs
  const resolveCompetency = (competencyId: string): CustomCompetency => {
    const found = competencies.find(c => c.id === competencyId);
    if (found) return found;
    return { id: competencyId, name: competencyId.replace(/_/g, ' '), description: '', behaviors: [] };
  };

  const maxRating = reviewConfig.ratingScale.max;

  const generateReviewPdf = async (review: PerformanceReview, cycleName?: string) => {
    setGeneratingPdfId(review.id);
    try {
      let orgName = '', orgAddress = '', logoDataUrl: string | null = null;
      try {
        const branding = await organizationService.getOrgBranding();
        orgName = branding.name;
        orgAddress = branding.address;
        logoDataUrl = branding.logoDataUrl;
      } catch { /* proceed without org info */ }

      const resolvedCycleName = cycleName || cycles?.find(c => c.id === review.cycleId)?.name || review.cycleId;
      const doc = await createPdfDocument('portrait');
      let y = await drawReportHeader(doc, {
        org: { name: orgName, address: orgAddress, logoDataUrl },
        title: t('pdf.title'),
        subtitle: resolvedCycleName,
      });

      y = drawDocumentTitle(doc, y, t('pdf.title'), resolvedCycleName);
      const checkPage = createPageBreakChecker(doc, () => y, (next) => { y = next; });

      y = drawFormSection(doc, y, t('pdf.sectionEmployee'), [
        { label: t('pdf.name'), value: review.employeeName || user.name || '' },
        { label: t('pdf.employeeId'), value: user.employeeId || '' },
        { label: t('pdf.department'), value: user.department || '' },
        { label: t('pdf.designation'), value: user.designation || '' },
        { label: t('pdf.manager'), value: review.managerName || t('pdf.notAvailable') },
      ], checkPage);

      const att = review.attendanceSummary;
      y = drawFormSection(doc, y, t('pdf.sectionAttendance'), [
        { label: t('pdf.totalWorkingDays'), value: String(att.totalWorkingDays) },
        { label: t('pdf.present'), value: String(att.presentDays) },
        { label: t('pdf.late'), value: String(att.lateDays) },
        { label: t('pdf.absent'), value: String(att.absentDays) },
        { label: t('pdf.earlyOut'), value: String(att.earlyOutDays) },
        { label: t('pdf.attendancePct'), value: `${att.attendancePercentage}%` },
      ], checkPage);

      const leaveRows = Object.entries(review.leaveSummary.typeBreakdown || {}).map(
        ([type, days]) => ({ label: t(`leaveTypeLabels.${type}`, { defaultValue: type.replace(/_/g, ' ') }), value: String(days) })
      );
      leaveRows.push({ label: t('pdf.totalLeaveDays'), value: String(review.leaveSummary.totalLeaveDays) });
      y = drawFormSection(doc, y, t('pdf.sectionLeave'), leaveRows, checkPage);

      checkPage(20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...PDF_COLORS.ink);
      doc.text(t('pdf.sectionRatings'), 14, y);
      y += 4;

      const tableBody = competencies.map(comp => {
        const selfR = review.selfRatings.find(r => r.competencyId === comp.id);
        const mgrR = review.managerRatings.find(r => r.competencyId === comp.id);
        return [
          comp.name,
          selfR?.rating ? `${selfR.rating}/${maxRating}` : '—',
          selfR?.comment || '—',
          mgrR?.rating ? `${mgrR.rating}/${maxRating}` : '—',
          mgrR?.comment || '—',
        ];
      });

      applyStandardTable(doc, {
        startY: y,
        head: [[
          t('pdf.colCompetency'),
          t('pdf.colSelfRating'),
          t('pdf.colSelfComment'),
          t('pdf.colManagerRating'),
          t('pdf.colManagerComment'),
        ]],
        body: tableBody,
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 18, halign: 'center' },
          2: { cellWidth: 45 },
          3: { cellWidth: 18, halign: 'center' },
          4: { cellWidth: 45 },
        },
      });
      y = (doc.lastAutoTable?.finalY || y) + 8;

      y = drawFormSection(doc, y, t('pdf.sectionRatingSummary'), [
        { label: t('pdf.selfAverage'), value: `${avgRating(review.selfRatings)}/${maxRating}` },
        { label: t('pdf.managerAverage'), value: `${avgRating(review.managerRatings)}/${maxRating}` },
      ], checkPage);

      if (review.status === 'COMPLETED') {
        y = drawFormSection(doc, y, t('pdf.sectionHrFinal'), [
          { label: t('pdf.overallRating'), value: review.hrOverallRating?.replace(/_/g, ' ') || t('pdf.notAvailable') },
          { label: t('pdf.hrRemarks'), value: review.hrFinalRemarks || t('pdf.notAvailable') },
        ], checkPage);
      }

      checkPage(24);
      y = Math.max(y + 16, 230);
      drawSignatureBlock(doc, y, [
        { label: t('pdf.signatureEmployee'), name: review.employeeName || user.name || '' },
        { label: t('pdf.signatureManager'), name: review.managerName || t('pdf.notAvailable') },
      ]);

      drawReportFooters(
        doc,
        t('pdf.generatedBy', { app: APP_NAME, date: formatGeneratedAt() }),
        (current, total) => t('pdf.page', { current, total })
      );

      const safeCycleName = resolvedCycleName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeName = (review.employeeName || user.name || 'Employee').replace(/[^a-zA-Z0-9_-]/g, '_');
      doc.save(`Avaliacao_Desempenho_${safeCycleName}_${safeName}.pdf`);
    } catch (err) {
      console.error('Failed to generate review PDF', err);
    } finally {
      setGeneratingPdfId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2"><h2 className="text-xl font-bold text-slate-900">{t('myPerformanceReview')}</h2><HelpButton helpPointId="review.employee" size={16} /></div>
          <p className="text-sm text-slate-500 mt-0.5">
            {activeCycle
              ? `${activeCycle.name} — ${new Date(activeCycle.startDate).toLocaleDateString()} to ${new Date(activeCycle.endDate).toLocaleDateString()}`
              : t('noCycles')}
          </p>
        </div>
        {myReview && (
          <div className="flex items-center gap-2">
            {(myReview.status === 'MANAGER_REVIEWED' || myReview.status === 'COMPLETED') && (
              <button
                onClick={() => generateReviewPdf(myReview, activeCycle?.name)}
                disabled={generatingPdfId === myReview.id}
                className="p-2 rounded-xl text-slate-400 hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-50"
                title={t('downloadPdf')}
              >
                {generatingPdfId === myReview.id ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
              </button>
            )}
            <ReviewStatusBadge status={myReview.status} />
          </div>
        )}
      </div>

      {/* No Active Cycle */}
      {!activeCycle && !upcomingCycle && (
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-8 text-center">
          <FileText size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">{t('noActiveCycle')}</p>
          <p className="text-xs text-slate-400 mt-1">{t('noActiveCycleHint')}</p>
        </div>
      )}

      {/* Upcoming Cycle Preview */}
      {!activeCycle && upcomingCycle && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 text-center">
          <Calendar size={36} className="mx-auto text-blue-400 mb-3" />
          <p className="font-semibold text-blue-800">{upcomingCycle.name}</p>
          <p className="text-sm text-blue-600 mt-1">
            Review period: {new Date(upcomingCycle.startDate).toLocaleDateString()} — {new Date(upcomingCycle.endDate).toLocaleDateString()}
          </p>
          <p className="text-xs text-blue-500 mt-2">
            Opens on <span className="font-semibold">{new Date(upcomingCycle.reviewStartDate).toLocaleDateString()}</span> — you'll be able to start your self-assessment then.
          </p>
        </div>
      )}

      {/* Active Cycle but no review created yet */}
      {activeCycle && !myReview && (
        <div className="bg-primary-light/30 border border-primary/10 rounded-2xl p-6 text-center">
          <FileText size={40} className="mx-auto text-primary mb-3" />
          <p className="text-slate-700 font-medium mb-3">{t('cycleOpenStart')}</p>
          <button
            onClick={handleCreateAndOpen}
            disabled={isProcessing || readOnly}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50"
          >
            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            {t('startSelfAssessment')}
          </button>
        </div>
      )}

      {/* Active Review Form */}
      {myReview && (
        <div className="space-y-4">
          {/* Attendance & Leave */}
          <AttendanceLeaveCard
            attendance={myReview.attendanceSummary}
            leave={myReview.leaveSummary}
          />

          {/* Self-Assessment Competencies */}
          <div>
            <h3 className="font-semibold text-slate-800 mb-3">{t('selfAssessment')}</h3>
            <div className="space-y-3">
              {competencies.map(comp => (
                <CompetencyRatingCard
                  key={comp.id}
                  competencyName={comp.name}
                  description={comp.description}
                  behaviors={comp.behaviors}
                  rating={canSubmit ? (ratings[comp.id]?.rating || 0) : (myReview.selfRatings.find(r => r.competencyId === comp.id)?.rating || 0)}
                  comment={canSubmit ? (ratings[comp.id]?.comment || '') : (myReview.selfRatings.find(r => r.competencyId === comp.id)?.comment || '')}
                  onRatingChange={canSubmit ? (v) => updateRating(comp.id, v) : undefined}
                  onCommentChange={canSubmit ? (v) => updateComment(comp.id, v) : undefined}
                  readOnly={!canSubmit}
                  label={t('selfAssessment')}
                  ratingScale={ratingScale}
                />
              ))}
            </div>
          </div>

          {/* Manager Ratings (visible after manager review) */}
          {(myReview.status === 'MANAGER_REVIEWED' || myReview.status === 'COMPLETED') && (
            <div>
              <h3 className="font-semibold text-slate-800 mb-3">{t('managerAssessment')}</h3>
              <div className="space-y-3">
                {myReview.managerRatings.filter(r => r.rating > 0).map(mRating => {
                  const comp = resolveCompetency(mRating.competencyId);
                  return (
                    <CompetencyRatingCard
                      key={mRating.competencyId}
                      competencyName={comp.name}
                      description={comp.description}
                      behaviors={comp.behaviors}
                      rating={mRating.rating}
                      comment={mRating.comment}
                      readOnly
                      label={t('manager')}
                      ratingScale={ratingScale}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* HR Final Remarks (visible when completed) */}
          {myReview.status === 'COMPLETED' && (
            <div className="bg-green-50 border border-green-100 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={18} className="text-green-600" />
                <h3 className="font-semibold text-green-800">{t('finalAssessment')}</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-green-600 font-medium mb-1">{t('overallRating')}</p>
                  <p className="font-bold text-green-900">{myReview.hrOverallRating?.replace(/_/g, ' ') || t('na')}</p>
                </div>
                <div>
                  <p className="text-xs text-green-600 font-medium mb-1">{t('selfAverage')}</p>
                  <p className="font-bold text-green-900">{avgRating(myReview.selfRatings)}</p>
                </div>
              </div>
              {myReview.hrFinalRemarks && (
                <div className="mt-3">
                  <p className="text-xs text-green-600 font-medium mb-1">{t('hrRemarks')}</p>
                  <p className="text-sm text-green-800">{myReview.hrFinalRemarks}</p>
                </div>
              )}
            </div>
          )}

          {/* Submit Button */}
          {canSubmit && (
            <div className="flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={isProcessing || !allRated}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50"
              >
                {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {t('submitSelfAssessment')}
              </button>
            </div>
          )}
          {canSubmit && !allRated && (
            <p className="text-xs text-slate-400 text-right">Please rate all {competencies.length} competencies before submitting.</p>
          )}
        </div>
      )}

      {/* Past Reviews History */}
      {pastReviews.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            Past Reviews ({pastReviews.length})
          </button>
          {showHistory && (
            <div className="mt-3 space-y-2">
              {pastReviews.map(review => (
                <div
                  key={review.id}
                  className="bg-white border border-slate-100 rounded-xl p-4 cursor-pointer hover:border-slate-200 transition-colors"
                  onClick={() => setExpandedHistoryId(expandedHistoryId === review.id ? null : review.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-slate-900">Cycle: {cycles?.find(c => c.id === review.cycleId)?.name || review.cycleId}</p>
                      <p className="text-xs text-slate-400">Self Avg: {avgRating(review.selfRatings)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {(review.status === 'MANAGER_REVIEWED' || review.status === 'COMPLETED') && (
                        <button
                          onClick={(e) => { e.stopPropagation(); generateReviewPdf(review); }}
                          disabled={generatingPdfId === review.id}
                          className="p-2 rounded-xl text-slate-400 hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-50"
                          title={t('downloadPdf')}
                        >
                          {generatingPdfId === review.id ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                        </button>
                      )}
                      <ReviewStatusBadge status={review.status} />
                    </div>
                  </div>
                  {expandedHistoryId === review.id && (
                    <div className="mt-3 pt-3 border-t border-slate-50">
                      <AttendanceLeaveCard attendance={review.attendanceSummary} leave={review.leaveSummary} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EmployeeReviewModule;
