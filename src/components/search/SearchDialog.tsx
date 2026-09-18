import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, BookOpen } from 'lucide-react';
import { useSearch } from '../../context/SearchContext';
import { tutorialService } from '../../services/tutorial.service';

interface SearchItem {
  type: 'guide';
  title: string;
  description: string;
  slug: string;
  category?: string;
}

const MAX_RESULTS = 12;

const SearchDialog: React.FC = () => {
  const { t } = useTranslation('common');
  const { isSearchOpen, setSearchOpen } = useSearch();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [guides, setGuides] = useState<SearchItem[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const dataLoaded = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSearchOpen || dataLoaded.current) return;
    dataLoaded.current = true;
    setLoading(true);
    tutorialService
      .getPublishedTutorials(1, 100)
      .then(({ tutorials }) => {
        setGuides(
          tutorials.map(tut => ({
            type: 'guide' as const,
            title: tut.title,
            description: tut.excerpt || '',
            slug: tut.slug,
            category: tut.category,
          }))
        );
      })
      .catch(() => setGuides([]))
      .finally(() => setLoading(false));
  }, [isSearchOpen]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (isSearchOpen) {
      setQuery('');
      setDebouncedQuery('');
      setHighlightIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isSearchOpen]);

  const normalized = debouncedQuery.trim().toLowerCase();
  const filtered = normalized
    ? guides.filter(
        g =>
          g.title.toLowerCase().includes(normalized) ||
          g.description.toLowerCase().includes(normalized) ||
          (g.category || '').toLowerCase().includes(normalized)
      )
    : guides.slice(0, MAX_RESULTS);

  const openGuide = useCallback(
    (slug: string) => {
      setSearchOpen(false);
      window.dispatchEvent(new CustomEvent('openhr-navigate', { detail: { path: 'help-article', params: { slug } } }));
    },
    [setSearchOpen]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isSearchOpen) return;
      if (e.key === 'Escape') {
        setSearchOpen(false);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex(i => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex(i => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && filtered[highlightIndex]) {
        e.preventDefault();
        openGuide(filtered[highlightIndex].slug);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSearchOpen, filtered, highlightIndex, openGuide, setSearchOpen]);

  if (!isSearchOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4">
      <button type="button" className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSearchOpen(false)} aria-label={t('close')} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('searchHelpPlaceholder', { defaultValue: 'Buscar na ajuda…' })}
            className="flex-1 text-sm outline-none bg-transparent"
          />
          <button type="button" onClick={() => setSearchOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div ref={resultsRef} className="max-h-[50vh] overflow-y-auto py-2">
          {loading ? (
            <p className="px-4 py-6 text-sm text-slate-500 text-center">{t('loading')}</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500 text-center">{t('noResults', { defaultValue: 'Nenhum resultado' })}</p>
          ) : (
            filtered.slice(0, MAX_RESULTS).map((item, index) => (
              <button
                key={item.slug}
                type="button"
                onClick={() => openGuide(item.slug)}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                  index === highlightIndex ? 'bg-primary/5' : 'hover:bg-slate-50'
                }`}
              >
                <BookOpen size={16} className="text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
                  {item.description && <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{item.description}</p>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchDialog;
