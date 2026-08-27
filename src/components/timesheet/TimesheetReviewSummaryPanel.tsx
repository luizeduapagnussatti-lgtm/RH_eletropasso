import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Employee, TimesheetDay, TimesheetEmployeeReview } from '../../types';
import { hrService } from '../../services/hrService';
import { formatIsoDateBr } from '../../i18n/format';

interface ReviewRow {
  employee: Employee;
  review: TimesheetEmployeeReview | null;
  employeeDays: TimesheetDay[];
  pendingManagerAck: number;
}

interface Props {
  rows: ReviewRow[];
  locked: boolean;
  dismissedScope?: boolean;
  onSelectEmployee: (employeeId: string) => void;
}

const reviewStatusClass: Record<string, string> = {
  OPEN: 'bg-slate-100 text-slate-700',
  IN_REVIEW: 'bg-sky-100 text-sky-800',
  EMPLOYEE_SIGNED: 'bg-violet-100 text-violet-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
};

const ReviewSignatureCell: React.FC<{ review: TimesheetEmployeeReview | null }> = ({ review }) => {
  const { t } = useTranslation('ptrp');
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

  const signed =
    review?.status === 'EMPLOYEE_SIGNED' ||
    review?.status === 'APPROVED' ||
    Boolean(review?.employeeSignedAt);

  useEffect(() => {
    let active = true;
    setSelfieUrl(null);
    setSignatureUrl(null);
    if (!review?.employeeSelfiePath && !review?.employeeSignaturePath) return;

    void (async () => {
      const [selfie, signature] = await Promise.all([
        review.employeeSelfiePath
          ? hrService.getTimesheetSignatureUrl(review.employeeSelfiePath)
          : null,
        review.employeeSignaturePath
          ? hrService.getTimesheetSignatureUrl(review.employeeSignaturePath)
          : null,
      ]);
      if (!active) return;
      setSelfieUrl(selfie);
      setSignatureUrl(signature);
    })();

    return () => {
      active = false;
    };
  }, [review?.employeeSelfiePath, review?.employeeSignaturePath, review?.id]);

  if (!signed) {
    return <span className="text-xs text-slate-400">{t('reviewSignedNo')}</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-emerald-700">{t('reviewSignedYes')}</span>
      {(selfieUrl || signatureUrl) && (
        <div className="flex gap-1">
          {selfieUrl && (
            <img
              src={selfieUrl}
              alt=""
              className="h-8 w-8 rounded-md object-cover border border-slate-200"
            />
          )}
          {signatureUrl && (
            <img
              src={signatureUrl}
              alt=""
              className="h-8 w-12 rounded-md object-contain border border-slate-200 bg-white"
            />
          )}
        </div>
      )}
    </div>
  );
};

const TimesheetReviewSummaryPanel: React.FC<Props> = ({ rows, locked, dismissedScope, onSelectEmployee }) => {
  const { t } = useTranslation('ptrp');

  if (rows.length === 0) return null;

  const approved = rows.filter(r => r.review?.status === 'APPROVED').length;
  const pending = rows.length - approved;

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{t('reviewSummaryTitle')}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {dismissedScope ? t('reviewSummaryHintDismissed') : t('reviewSummaryHint')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide">
          <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-800">
            {t('reviewSummaryApproved', { count: approved, total: rows.length })}
          </span>
          {pending > 0 && (
            <span className="px-2 py-1 rounded-md bg-sky-50 text-sky-800">
              {t('reviewSummaryPending', { count: pending })}
            </span>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th className="px-3 py-2.5 font-semibold">{t('employee')}</th>
              <th className="px-3 py-2.5 font-semibold">{t('reviewColStatus')}</th>
              <th className="px-3 py-2.5 font-semibold">{t('reviewColSigned')}</th>
              <th className="px-3 py-2.5 font-semibold">{t('managerAckCol')}</th>
              <th className="px-3 py-2.5 font-semibold">{t('reviewColActions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ employee, review, pendingManagerAck }) => {
              const status = review?.status ?? 'OPEN';
              return (
                <tr key={employee.id} className="border-t border-slate-100 hover:bg-primary/10">
                  <td className="px-3 py-2.5 font-medium text-slate-800">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>{employee.name}</span>
                      {employee.status === 'INACTIVE' && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-600">
                          {t('dismissedBadge')}
                        </span>
                      )}
                    </div>
                    {employee.status === 'INACTIVE' && employee.terminationDate ? (
                      <p className="text-[11px] font-normal text-slate-500 mt-0.5">
                        {t('lastWorkDayLabel')}: {formatIsoDateBr(employee.terminationDate)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${reviewStatusClass[status]}`}>
                      {t(`reviewStatus_${status}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <ReviewSignatureCell review={review} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                    {pendingManagerAck > 0 ? (
                      <span>{t('reviewPendingManagerAckShort', { count: pendingManagerAck })}</span>
                    ) : (
                      <span className="text-emerald-700 font-medium">{t('reviewAckComplete')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => onSelectEmployee(employee.id)}
                      className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                    >
                      {t('reviewOpenEmployee')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TimesheetReviewSummaryPanel;

export type { ReviewRow };
