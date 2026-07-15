
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ReviewStatus } from '../../types';
import { tStatus } from '../../i18n/statusMaps';

interface Props {
  status: ReviewStatus;
}

const STATUS_STYLE: Record<ReviewStatus, { bg: string; text: string }> = {
  DRAFT: { bg: 'bg-slate-100', text: 'text-slate-600' },
  SELF_REVIEW_SUBMITTED: { bg: 'bg-blue-100', text: 'text-blue-700' },
  MANAGER_REVIEWED: { bg: 'bg-orange-100', text: 'text-orange-700' },
  COMPLETED: { bg: 'bg-green-100', text: 'text-green-700' },
};

const ReviewStatusBadge: React.FC<Props> = ({ status }) => {
  useTranslation('status'); // re-render on language change
  const config = STATUS_STYLE[status] || STATUS_STYLE.DRAFT;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}>
      {tStatus('review', status)}
    </span>
  );
};

export default ReviewStatusBadge;
