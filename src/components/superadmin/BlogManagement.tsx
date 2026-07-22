import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Edit, Trash2, Eye, EyeOff, Save, Loader2, Image, ArrowLeft } from 'lucide-react';
import { blogService } from '../../services/blog.service';
import { BlogPost } from '../../types';
import RichTextEditor from '../blog/RichTextEditor';
import { sanitizeHtml } from '../../utils/sanitize';
import { tStatus } from '../../i18n/statusMaps';

interface BlogManagementProps {
  onMessage: (msg: { type: 'success' | 'error'; text: string }) => void;
}

type ViewMode = 'list' | 'create' | 'edit';

const generateSlug = (title: string): string => {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric chars with hyphens
    .replace(/-{2,}/g, '-')        // Collapse multiple consecutive hyphens
    .replace(/(^-|-$)/g, '');      // Remove leading/trailing hyphens
};

const BlogManagement: React.FC<BlogManagementProps> = ({ onMessage }) => {
  const { t } = useTranslation('superadmin');
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    status: 'DRAFT' as 'DRAFT' | 'PUBLISHED',
    authorName: '',
    coverImage: null as File | null,
  });

  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const formatStatus = (status: 'DRAFT' | 'PUBLISHED') =>
    status === 'DRAFT' ? tStatus('review', 'DRAFT') : t('blog.status.PUBLISHED');

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    setIsLoading(true);
    const data = await blogService.getAllPosts();
    setPosts(data);
    setIsLoading(false);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      slug: '',
      excerpt: '',
      content: '',
      status: 'DRAFT',
      authorName: '',
      coverImage: null,
    });
    setCoverPreview(null);
    setEditingPost(null);
    setShowPreview(false);
  };

  const openCreateMode = () => {
    resetForm();
    setViewMode('create');
  };

  const openEditMode = (post: BlogPost) => {
    setEditingPost(post);
    setFormData({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      status: post.status,
      authorName: post.authorName,
      coverImage: null,
    });
    setCoverPreview(post.coverImage || null);
    setViewMode('edit');
  };

  const handleTitleChange = (title: string) => {
    setFormData(prev => ({
      ...prev,
      title,
      slug: viewMode === 'create' ? generateSlug(title) : prev.slug,
    }));
  };

  const handleCoverImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData(prev => ({ ...prev, coverImage: file }));
      const reader = new FileReader();
      reader.onloadend = () => setCoverPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      onMessage({ type: 'error', text: t('blog.validation.titleRequired') });
      return;
    }
    if (!formData.slug.trim()) {
      onMessage({ type: 'error', text: t('blog.validation.slugRequired') });
      return;
    }

    setIsSaving(true);

    if (viewMode === 'create') {
      const result = await blogService.createPost({
        title: formData.title,
        slug: formData.slug,
        content: formData.content,
        excerpt: formData.excerpt,
        coverImage: formData.coverImage,
        status: formData.status,
        authorName: formData.authorName,
      });
      if (result.success) {
        onMessage({ type: 'success', text: result.message });
        resetForm();
        setViewMode('list');
        await loadPosts();
      } else {
        onMessage({ type: 'error', text: result.message });
      }
    } else if (viewMode === 'edit' && editingPost) {
      const result = await blogService.updatePost(editingPost.id, {
        title: formData.title,
        slug: formData.slug,
        content: formData.content,
        excerpt: formData.excerpt,
        coverImage: formData.coverImage,
        status: formData.status,
        authorName: formData.authorName,
      });
      if (result.success) {
        onMessage({ type: 'success', text: result.message });
        resetForm();
        setViewMode('list');
        await loadPosts();
      } else {
        onMessage({ type: 'error', text: result.message });
      }
    }

    setIsSaving(false);
  };

  const handleDelete = async (post: BlogPost) => {
    if (!window.confirm(t('blog.deleteConfirm', { title: post.title }))) {
      return;
    }
    const result = await blogService.deletePost(post.id);
    if (result.success) {
      onMessage({ type: 'success', text: result.message });
      await loadPosts();
    } else {
      onMessage({ type: 'error', text: result.message });
    }
  };

  const handleTogglePublish = async (post: BlogPost) => {
    const newStatus = post.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    const result = await blogService.updatePost(post.id, {
      status: newStatus,
      publishedAt: newStatus === 'PUBLISHED' ? new Date().toISOString() : '',
    });
    if (result.success) {
      onMessage({
        type: 'success',
        text: newStatus === 'PUBLISHED' ? t('blog.publishedSuccess') : t('blog.unpublishedSuccess'),
      });
      await loadPosts();
    } else {
      onMessage({ type: 'error', text: result.message });
    }
  };

  // LIST VIEW
  if (viewMode === 'list') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-slate-900">{t('blog.listTitle')}</h3>
          <button
            onClick={openCreateMode}
            className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-primary-hover transition-all shadow-lg"
          >
            <Plus size={18} /> {t('blog.newPost')}
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-slate-400">
            <Loader2 className="animate-spin mx-auto mb-2" size={32} />
            {t('blog.loading')}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
            <Edit size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium">{t('blog.emptyTitle')}</p>
            <p className="text-slate-400 text-sm mt-1">{t('blog.emptyHint')}</p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('blog.table.title')}</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('blog.table.status')}</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('blog.table.author')}</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('blog.table.date')}</th>
                    <th className="text-right p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('blog.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {posts.map(post => (
                    <tr key={post.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {post.coverImage ? (
                            <img src={post.coverImage} alt="" className="w-12 h-12 rounded-lg object-cover" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center">
                              <Image size={20} className="text-slate-400" />
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-slate-900">{post.title}</p>
                            <p className="text-xs text-slate-400">/{post.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          post.status === 'PUBLISHED'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {formatStatus(post.status)}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-slate-600">{post.authorName || '-'}</span>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-slate-500">
                          {post.publishedAt
                            ? new Date(post.publishedAt).toLocaleDateString()
                            : new Date(post.created).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleTogglePublish(post)}
                            className={`p-2 rounded-xl transition-all ${
                              post.status === 'PUBLISHED'
                                ? 'hover:bg-amber-100'
                                : 'hover:bg-emerald-100'
                            }`}
                            title={post.status === 'PUBLISHED' ? t('blog.actions.unpublish') : t('blog.actions.publish')}
                          >
                            {post.status === 'PUBLISHED' ? (
                              <EyeOff size={18} className="text-amber-600" />
                            ) : (
                              <Eye size={18} className="text-emerald-600" />
                            )}
                          </button>
                          <button
                            onClick={() => openEditMode(post)}
                            className="p-2 hover:bg-blue-100 rounded-xl transition-all"
                            title={t('blog.actions.edit')}
                          >
                            <Edit size={18} className="text-blue-600" />
                          </button>
                          <button
                            onClick={() => handleDelete(post)}
                            className="p-2 hover:bg-red-100 rounded-xl transition-all"
                            title={t('blog.actions.delete')}
                          >
                            <Trash2 size={18} className="text-red-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // CREATE / EDIT VIEW
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => { resetForm(); setViewMode('list'); }}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium transition-colors"
        >
          <ArrowLeft size={20} /> {t('blog.backToList')}
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-200 transition-all"
          >
            <Eye size={16} /> {showPreview ? t('blog.previewEdit') : t('blog.previewView')}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-primary-hover transition-all shadow-lg disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {viewMode === 'create' ? t('blog.createPost') : t('blog.updatePost')}
          </button>
        </div>
      </div>

      <h3 className="text-xl font-bold text-slate-900">
        {viewMode === 'create' ? t('blog.createTitle') : t('blog.editTitle', { title: editingPost?.title })}
      </h3>

      {showPreview ? (
        // PREVIEW MODE
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
          {coverPreview && (
            <img src={coverPreview} alt={t('blog.coverAlt')} className="w-full h-64 object-cover rounded-2xl mb-6" />
          )}
          <h1 className="text-3xl font-semibold text-slate-900 mb-2">{formData.title || t('blog.untitled')}</h1>
          <p className="text-slate-500 mb-6">{formData.authorName && t('blog.byAuthor', { name: formData.authorName })}</p>
          {formData.excerpt && (
            <p className="text-lg text-slate-600 italic mb-6 border-l-4 border-primary pl-4">{formData.excerpt}</p>
          )}
          <div
            className="prose prose-slate max-w-none prose-headings:font-bold prose-a:text-primary prose-a:underline prose-img:rounded-xl"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(formData.content) }}
          />
        </div>
      ) : (
        // EDIT MODE
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">{t('blog.form.title')}</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary text-slate-900"
              placeholder={t('blog.form.titlePlaceholder')}
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">{t('blog.form.slug')}</label>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">{t('blog.form.slugPrefix')}</span>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary text-slate-900"
                placeholder={t('blog.form.slugPlaceholder')}
              />
            </div>
          </div>

          {/* Author Name */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">{t('blog.form.authorName')}</label>
            <input
              type="text"
              value={formData.authorName}
              onChange={(e) => setFormData(prev => ({ ...prev, authorName: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary text-slate-900"
              placeholder={t('blog.form.authorPlaceholder')}
            />
          </div>

          {/* Excerpt */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">{t('blog.form.excerpt')}</label>
            <textarea
              value={formData.excerpt}
              onChange={(e) => setFormData(prev => ({ ...prev, excerpt: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary text-slate-900 resize-vertical"
              rows={3}
              placeholder={t('blog.form.excerptPlaceholder')}
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">{t('blog.form.content')}</label>
            <RichTextEditor
              value={formData.content}
              onChange={(html) => setFormData(prev => ({ ...prev, content: html }))}
              placeholder={t('blog.form.contentPlaceholder')}
            />
          </div>

          {/* Cover Image */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">{t('blog.form.coverImage')}</label>
            <div className="flex items-center gap-4">
              {coverPreview && (
                <img src={coverPreview} alt={t('blog.coverPreviewAlt')} className="w-24 h-24 rounded-xl object-cover" />
              )}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCoverImageChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-200 transition-all"
                >
                  <Image size={16} /> {coverPreview ? t('blog.form.changeImage') : t('blog.form.uploadImage')}
                </button>
              </div>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">{t('blog.form.status')}</label>
            <div className="flex gap-3">
              <button
                onClick={() => setFormData(prev => ({ ...prev, status: 'DRAFT' }))}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  formData.status === 'DRAFT'
                    ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-300'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tStatus('review', 'DRAFT')}
              </button>
              <button
                onClick={() => setFormData(prev => ({ ...prev, status: 'PUBLISHED' }))}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  formData.status === 'PUBLISHED'
                    ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-300'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t('blog.status.PUBLISHED')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlogManagement;
