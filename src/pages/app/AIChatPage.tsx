import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth-context'
import { Icon, SectionCard } from '../../components/ui'
import {
  approveGeneratedChecklistItem,
  createAIChatThread,
  createChecklistDraft,
  deleteAIChatThread,
  fetchAIChatBootstrap,
  fetchAIChatThread,
  fetchAIChatThreads,
  rejectGeneratedChecklistItem,
  updateAIChatDraftContext,
  type AIChatBootstrap,
  type AIChatDraftContext,
  type AIChatThread,
  type AIGeneratedChecklistItem,
  type DraftContextPayload,
} from '../../features/ai-chat/api'
import { fetchChecklistBatches, type ChecklistBatch } from '../../features/checklist/api'
import { fetchProjects, type ProjectSummary } from '../../features/projects/api'
import { getErrorMessage } from '../../lib/api'
import { EmptySection, FormMessage, LoadingSection, formatChatTime } from '../shared'

type ThreadSummary = Pick<AIChatThread, 'id' | 'title' | 'created_at' | 'created_at_iso' | 'updated_at' | 'updated_at_iso' | 'last_message_at' | 'last_message_at_iso' | 'draft_context'>

type DraftFormState = {
  projectId: number
  targetMode: 'new' | 'existing'
  existingBatchId: number
  batchTitle: string
  moduleName: string
  submoduleName: string
  pageUrl: string
}

const emptyDraftForm: DraftFormState = {
  projectId: 0,
  targetMode: 'new',
  existingBatchId: 0,
  batchTitle: '',
  moduleName: '',
  submoduleName: '',
  pageUrl: '',
}

function isValidPageUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function draftContextToForm(context?: AIChatDraftContext | null): DraftFormState {
  if (!context) {
    return emptyDraftForm
  }

  return {
    projectId: context.project_id ?? 0,
    targetMode: context.target_mode === 'existing' ? 'existing' : 'new',
    existingBatchId: context.existing_batch_id ?? 0,
    batchTitle: context.batch_title ?? '',
    moduleName: context.module_name ?? '',
    submoduleName: context.submodule_name ?? '',
    pageUrl: context.page_url ?? '',
  }
}

function formMatchesContext(form: DraftFormState, context?: AIChatDraftContext | null) {
  if (!context) {
    return false
  }

  return (
    form.projectId === (context.project_id ?? 0) &&
    form.targetMode === (context.target_mode === 'existing' ? 'existing' : 'new') &&
    form.existingBatchId === (context.existing_batch_id ?? 0) &&
    form.batchTitle.trim() === (context.batch_title ?? '').trim() &&
    form.moduleName.trim() === (context.module_name ?? '').trim() &&
    form.submoduleName.trim() === (context.submodule_name ?? '').trim() &&
    form.pageUrl.trim() === (context.page_url ?? '').trim()
  )
}

function formatThreadContextLabel(context?: AIChatDraftContext | null) {
  if (!context?.project_id) {
    return 'Checklist target not set'
  }
  if (context.target_mode === 'existing') {
    return `${context.project_name || 'Project'} • ${context.existing_batch_title || 'Existing batch'}`
  }
  return `${context.project_name || 'Project'} • ${context.batch_title || 'New batch'}`
}

function buildDraftPayload(form: DraftFormState): DraftContextPayload {
  if (form.projectId <= 0) {
    throw new Error('Select a project before drafting checklist items.')
  }

  if (form.targetMode === 'existing') {
    if (form.existingBatchId <= 0) {
      throw new Error('Select an existing checklist batch for this project.')
    }

    return {
      project_id: form.projectId,
      target_mode: 'existing',
      existing_batch_id: form.existingBatchId,
    }
  }

  if (!form.batchTitle.trim() || !form.moduleName.trim()) {
    throw new Error('Batch title and module name are required for a new checklist batch.')
  }
  if (!isValidPageUrl(form.pageUrl.trim())) {
    throw new Error('Link is required and must be a valid http:// or https:// URL.')
  }

  return {
    project_id: form.projectId,
    target_mode: 'new',
    batch_title: form.batchTitle.trim(),
    module_name: form.moduleName.trim(),
    submodule_name: form.submoduleName.trim(),
    page_url: form.pageUrl.trim(),
  }
}

function duplicateTone(status: string) {
  if (status === 'confirmed_duplicate') {
    return 'warning'
  }
  if (status === 'possible_duplicate') {
    return 'info'
  }
  return 'success'
}

export function AIChatPage() {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { activeOrgId, session } = useAuth()
  const [bootstrap, setBootstrap] = useState<AIChatBootstrap | null>(null)
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [availableBatches, setAvailableBatches] = useState<ChecklistBatch[]>([])
  const [activeThread, setActiveThread] = useState<AIChatThread | null>(null)
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null)
  const [draftForm, setDraftForm] = useState<DraftFormState>(emptyDraftForm)
  const [composer, setComposer] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [pendingItemId, setPendingItemId] = useState<number | null>(null)
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [railOpen, setRailOpen] = useState(false)

  const hasConfiguredRuntime = Boolean(bootstrap?.enabled)
  const isContextLocked = Boolean(activeThread?.draft_context.is_locked)
  const contextSaved = formMatchesContext(draftForm, activeThread?.draft_context)
  const canSend = hasConfiguredRuntime && !pending && attachments.length > 0

  const resizeComposer = () => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }
    textarea.style.height = '0px'
    const computed = window.getComputedStyle(textarea)
    const lineHeight = Number.parseFloat(computed.lineHeight || '22')
    const maxHeight = lineHeight * 4 + 18
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }

  const loadBootstrap = async () => {
    if (!session?.accessToken || !activeOrgId) {
      setBootstrap(null)
      return
    }

    try {
      const result = await fetchAIChatBootstrap(session.accessToken, activeOrgId)
      setBootstrap(result)
      setError('')
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load AI checklist drafting configuration.'))
    }
  }

  const loadThreads = async () => {
    if (!session?.accessToken || !activeOrgId) {
      setThreads([])
      return
    }

    try {
      const result = await fetchAIChatThreads(session.accessToken, activeOrgId)
      setThreads(result.threads)
      if (!activeThreadId && result.threads.length > 0) {
        setActiveThreadId(result.threads[0].id)
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load AI chat threads.'))
    }
  }

  const loadProjects = async () => {
    if (!session?.accessToken || !activeOrgId) {
      setProjects([])
      return
    }

    try {
      const result = await fetchProjects(session.accessToken, activeOrgId, 'active')
      setProjects(result.projects)
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load projects for checklist drafting.'))
    }
  }

  const loadExistingBatches = async (projectId: number) => {
    if (!session?.accessToken || !activeOrgId || projectId <= 0 || draftForm.targetMode !== 'existing') {
      setAvailableBatches([])
      return
    }

    setLoadingBatches(true)
    try {
      const result = await fetchChecklistBatches(session.accessToken, activeOrgId, { projectId })
      setAvailableBatches(result.batches)
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load checklist batches for the selected project.'))
    } finally {
      setLoadingBatches(false)
    }
  }

  const loadThread = async (threadId: number) => {
    if (!session?.accessToken || !activeOrgId) {
      setActiveThread(null)
      return
    }

    try {
      const result = await fetchAIChatThread(session.accessToken, activeOrgId, threadId)
      setActiveThread(result.thread)
      setError('')
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load AI chat thread.'))
    }
  }

  useEffect(() => {
    void Promise.all([loadBootstrap(), loadThreads(), loadProjects()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, session?.accessToken])

  useEffect(() => {
    if (!activeThreadId || pending) {
      if (!activeThreadId) {
        setActiveThread(null)
      }
      return
    }

    void loadThread(activeThreadId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId, activeOrgId, session?.accessToken])

  useEffect(() => {
    resizeComposer()
  }, [composer])

  useEffect(() => {
    if (activeThread?.draft_context) {
      setDraftForm(draftContextToForm(activeThread.draft_context))
    }
  }, [activeThread?.id, activeThread?.draft_context])

  useEffect(() => {
    void loadExistingBatches(draftForm.projectId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftForm.projectId, draftForm.targetMode, activeOrgId, session?.accessToken])

  const ensureThread = async () => {
    if (activeThreadId) {
      if (activeThread) {
        return { threadId: activeThreadId, thread: activeThread }
      }
      if (!session?.accessToken || !activeOrgId) {
        throw new Error('Active organization is required.')
      }

      const result = await fetchAIChatThread(session.accessToken, activeOrgId, activeThreadId)
      setActiveThread(result.thread)
      return { threadId: activeThreadId, thread: result.thread }
    }
    if (!session?.accessToken || !activeOrgId) {
      throw new Error('Active organization is required.')
    }

    const result = await createAIChatThread(session.accessToken, activeOrgId)
    setThreads((current) => [result.thread, ...current])
    setActiveThreadId(result.thread.id)
    setActiveThread(result.thread)
    return { threadId: result.thread.id, thread: result.thread }
  }

  const syncThreadContext = async () => {
    if (!session?.accessToken || !activeOrgId) {
      throw new Error('Active organization is required.')
    }

    const payload = buildDraftPayload(draftForm)
    const { threadId, thread } = await ensureThread()
    if (formMatchesContext(draftForm, thread.draft_context)) {
      return { threadId, thread }
    }

    const result = await updateAIChatDraftContext(session.accessToken, activeOrgId, threadId, payload)
    setActiveThread(result.thread)
    setThreads((current) => current.map((item) => (item.id === threadId ? result.thread : item)))
    return { threadId, thread: result.thread }
  }

  const handleCreateThread = async () => {
    if (!session?.accessToken || !activeOrgId) {
      return
    }

    setError('')
    setMessage('')
    try {
      const result = await createAIChatThread(session.accessToken, activeOrgId)
      setThreads((current) => [result.thread, ...current])
      setActiveThreadId(result.thread.id)
      setActiveThread(result.thread)
      setComposer('')
      setAttachments([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      setRailOpen(false)
    } catch (createError) {
      setError(getErrorMessage(createError, 'Unable to create a new AI checklist draft chat.'))
    }
  }

  const handleDeleteThread = async (threadId: number) => {
    if (!session?.accessToken || !activeOrgId || !window.confirm('Delete this checklist draft chat?')) {
      return
    }

    setError('')
    try {
      await deleteAIChatThread(session.accessToken, activeOrgId, threadId)
      const remainingThreads = threads.filter((thread) => thread.id !== threadId)
      setThreads(remainingThreads)
      if (activeThreadId === threadId) {
        const nextThread = remainingThreads[0] ?? null
        setActiveThreadId(nextThread?.id ?? null)
        setActiveThread(null)
        setDraftForm(nextThread?.draft_context ? draftContextToForm(nextThread.draft_context) : emptyDraftForm)
      }
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete the AI chat thread.'))
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAttachments(Array.from(event.target.files ?? []))
  }

  const handleSend = async () => {
    if (!session?.accessToken || !activeOrgId || pending) {
      return
    }
    if (attachments.length === 0) {
      setError('Upload at least one image before generating checklist draft items.')
      return
    }
    if (!hasConfiguredRuntime) {
      setError(bootstrap?.error_message || 'AI checklist drafting is not configured correctly.')
      return
    }

    setPending(true)
    setError('')
    setMessage('')

    try {
      const { threadId } = await syncThreadContext()
      const result = await createChecklistDraft(session.accessToken, activeOrgId, threadId, composer.trim(), attachments)
      setActiveThreadId(result.thread.id)
      setActiveThread(result.thread)
      setThreads((current) =>
        current.some((item) => item.id === result.thread.id)
          ? current.map((item) => (item.id === result.thread.id ? result.thread : item))
          : [result.thread, ...current],
      )
      setComposer('')
      setAttachments([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      await loadThreads()
    } catch (sendError) {
      setError(getErrorMessage(sendError, 'Unable to draft checklist items from the uploaded module screenshots.'))
    } finally {
      setPending(false)
    }
  }

  const handleReviewAction = async (item: AIGeneratedChecklistItem, action: 'approve' | 'reject') => {
    if (!session?.accessToken || !activeOrgId || !activeThreadId) {
      return
    }

    setPendingItemId(item.id)
    setError('')
    setMessage('')
    try {
      if (action === 'approve') {
        await approveGeneratedChecklistItem(session.accessToken, activeOrgId, item.id)
        setMessage(`"${item.title}" was added to the checklist batch.`)
      } else {
        await rejectGeneratedChecklistItem(session.accessToken, activeOrgId, item.id)
        setMessage(`"${item.title}" was rejected.`)
      }

      await Promise.all([loadThread(activeThreadId), loadThreads()])
    } catch (actionError) {
      setError(getErrorMessage(actionError, `Unable to ${action} the generated checklist item.`))
    } finally {
      setPendingItemId(null)
    }
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  const projectOptions = useMemo(() => projects, [projects])
  const selectedExistingBatch = useMemo(
    () => availableBatches.find((batch) => batch.id === draftForm.existingBatchId) ?? null,
    [availableBatches, draftForm.existingBatchId],
  )
  const existingBatchPageUrl = selectedExistingBatch?.page_url ?? activeThread?.draft_context.page_url ?? ''
  const activeTargetLabel = formatThreadContextLabel(activeThread?.draft_context)
  const contextNeedsSave = Boolean(activeThreadId) && !contextSaved

  if (!activeOrgId) {
    return <EmptySection title="AI Chat" message="Set an active organization first." />
  }

  if (!bootstrap && !error) {
    return <LoadingSection title="AI Chat" subtitle="Checklist drafting assistant" />
  }

  return (
    <div className="page-stack">
      {message ? <FormMessage tone="success">{message}</FormMessage> : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      {!hasConfiguredRuntime ? (
        <SectionCard title="AI Checklist Drafting Setup" subtitle="Super Admin configuration is required">
          <div className="bullet-stack">
            <div className="bullet-row">
              <span className="bullet-row__marker" />
              <p>{bootstrap?.error_message || 'AI checklist drafting is not configured correctly. Go to Super Admin > AI Admin.'}</p>
            </div>
            <div className="bullet-row">
              <span className="bullet-row__marker" />
              <p>Choose a vision-capable model because this page only works from module screenshots.</p>
            </div>
          </div>
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Checklist Target" subtitle={activeTargetLabel}>
            <div className="auth-stack">
              <select
                className="input-inline select-inline"
                value={draftForm.projectId}
                onChange={(event) =>
                  setDraftForm((current) => ({
                    ...current,
                    projectId: Number(event.target.value),
                    existingBatchId: 0,
                    pageUrl: current.targetMode === 'existing' ? '' : current.pageUrl,
                  }))
                }
                disabled={pending || isContextLocked}
              >
                <option value={0}>Select project</option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <select
                className="input-inline select-inline"
                value={draftForm.targetMode}
                onChange={(event) =>
                  setDraftForm((current) => ({
                    ...current,
                    targetMode: event.target.value === 'existing' ? 'existing' : 'new',
                    existingBatchId: 0,
                    pageUrl: event.target.value === 'existing' ? '' : current.pageUrl,
                  }))
                }
                disabled={pending || isContextLocked || draftForm.projectId <= 0}
              >
                <option value="new">New batch</option>
                <option value="existing">Existing batch</option>
              </select>
              {draftForm.targetMode === 'existing' ? (
                <>
                <select
                  className="input-inline select-inline"
                  value={draftForm.existingBatchId}
                  onChange={(event) =>
                    setDraftForm((current) => ({
                      ...current,
                      existingBatchId: Number(event.target.value),
                      pageUrl:
                        availableBatches.find((batch) => batch.id === Number(event.target.value))?.page_url ?? '',
                    }))
                  }
                  disabled={pending || isContextLocked || draftForm.projectId <= 0 || loadingBatches}
                >
                  <option value={0}>{loadingBatches ? 'Loading batches...' : 'Select checklist batch'}</option>
                  {availableBatches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.title} • {batch.module_name}
                    </option>
                  ))}
                </select>
                <input
                  className="input-inline"
                  value={existingBatchPageUrl}
                  placeholder="No link saved for this batch"
                  disabled
                  readOnly
                />
                {existingBatchPageUrl ? (
                  <a className="inline-link" href={existingBatchPageUrl} target="_blank" rel="noreferrer noopener">
                    Open saved page link
                  </a>
                ) : (
                  <p className="body-copy">This existing batch does not have a saved page link yet.</p>
                )}
                </>
              ) : (
                <>
                  <input
                    className="input-inline"
                    value={draftForm.batchTitle}
                    onChange={(event) => setDraftForm((current) => ({ ...current, batchTitle: event.target.value }))}
                    placeholder="Batch title"
                    disabled={pending || isContextLocked}
                  />
                  <input
                    className="input-inline"
                    value={draftForm.moduleName}
                    onChange={(event) => setDraftForm((current) => ({ ...current, moduleName: event.target.value }))}
                    placeholder="Module name"
                    disabled={pending || isContextLocked}
                  />
                  <input
                    className="input-inline"
                    value={draftForm.submoduleName}
                    onChange={(event) => setDraftForm((current) => ({ ...current, submoduleName: event.target.value }))}
                    placeholder="Submodule name (optional)"
                    disabled={pending || isContextLocked}
                  />
                  <input
                    className="input-inline"
                    value={draftForm.pageUrl}
                    onChange={(event) => setDraftForm((current) => ({ ...current, pageUrl: event.target.value }))}
                    placeholder="Website page link (https://...)"
                    disabled={pending || isContextLocked}
                    inputMode="url"
                  />
                </>
              )}
              <div className="bullet-stack">
                <div className="bullet-row">
                  <span className="bullet-row__marker" />
                  <p>Each approved AI card is inserted immediately into the real checklist under this connected project target.</p>
                </div>
                <div className="bullet-row">
                  <span className="bullet-row__marker" />
                  <p>{isContextLocked ? 'This chat is locked to its saved checklist batch because at least one item was already approved.' : contextNeedsSave ? 'You changed the target. Send the next draft to save the updated target context.' : 'This target is ready for the next screenshot-based checklist draft.'}</p>
                </div>
              </div>
            </div>
          </SectionCard>

          <div className={`ai-chat-layout ${railOpen ? 'is-rail-open' : ''}`}>
            <button type="button" className={`ai-chat-rail-backdrop ${railOpen ? 'is-open' : ''}`} aria-label="Close conversation list" onClick={() => setRailOpen(false)} />
            <section className="ai-chat-sidebar">
              <div className="ai-chat-sidebar__header">
                <div>
                  <p className="eyebrow">Checklist Drafts</p>
                  <h2>{bootstrap?.assistant_name || 'BugCatcher AI'}</h2>
                </div>
                <button type="button" className="button button--primary button--tiny" onClick={() => void handleCreateThread()}>
                  New chat
                </button>
              </div>
              <div className="ai-chat-thread-list">
                {threads.length > 0 ? (
                  threads.map((thread) => (
                    <article
                      key={thread.id}
                      className={`ai-chat-thread-card ${activeThreadId === thread.id ? 'is-active' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setActiveThreadId(thread.id)
                        setRailOpen(false)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setActiveThreadId(thread.id)
                          setRailOpen(false)
                        }
                      }}
                    >
                      <div className="ai-chat-thread-card__body">
                        <strong>{thread.title}</strong>
                        <span>{formatThreadContextLabel(thread.draft_context)}</span>
                        <span>{formatChatTime(thread.last_message_at || thread.updated_at || thread.created_at, thread.last_message_at_iso || thread.updated_at_iso || thread.created_at_iso)}</span>
                      </div>
                      <button
                        type="button"
                        className="ai-chat-thread-card__delete"
                        aria-label={`Delete ${thread.title}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleDeleteThread(thread.id)
                        }}
                      >
                        x
                      </button>
                    </article>
                  ))
                ) : (
                  <p className="body-copy">No checklist draft chats yet. Start by choosing a project target and creating a new chat.</p>
                )}
              </div>
            </section>

            <section className="ai-chat-panel">
              <button type="button" className="icon-button ai-chat-panel__rail-toggle is-floating" onClick={() => setRailOpen((current) => !current)} aria-label="Open conversation list">
                <Icon name="more" />
              </button>
              <div className="ai-chat-messages">
                {activeThread?.messages?.length ? (
                  activeThread.messages.map((messageItem) => (
                    <article key={`${messageItem.role}-${messageItem.id}`} className={`ai-chat-bubble-row ai-chat-bubble-row--${messageItem.role}`}>
                      <div className={`ai-chat-bubble ai-chat-bubble--${messageItem.role}`}>
                        <span className="ai-chat-bubble__author">{messageItem.role === 'assistant' ? bootstrap?.assistant_name || 'BugCatcher AI' : 'You'} {' • '} {formatChatTime(messageItem.created_at)}</span>
                        {messageItem.attachments.length ? (
                          <div className="ai-chat-attachment-list">
                            {messageItem.attachments.map((attachment) => (
                              <a key={`${attachment.original_name}-${attachment.id}`} className="ai-chat-attachment" href={attachment.file_path || '#'} target={attachment.file_path ? '_blank' : undefined} rel={attachment.file_path ? 'noreferrer' : undefined}>
                                <strong>{attachment.original_name}</strong>
                                <span>{formatFileSize(attachment.file_size)}</span>
                              </a>
                            ))}
                          </div>
                        ) : null}
                        <p>{messageItem.content || (messageItem.status === 'streaming' ? 'Drafting checklist items...' : ' ')}</p>
                        {messageItem.error_message ? <small className="ai-chat-bubble__error">{messageItem.error_message}</small> : null}
                        {messageItem.generated_checklist_items.length ? (
                          <div className="ai-chat-generated-list">
                            {messageItem.generated_checklist_items.map((item) => (
                              <article key={item.id} className={`ai-chat-generated-card is-${item.review_status}`}>
                                <div className="ai-chat-generated-card__header">
                                  <div>
                                    <strong>{item.title}</strong>
                                    <span>{item.module_name}{item.submodule_name ? ` / ${item.submodule_name}` : ''}</span>
                                  </div>
                                  <div className="ai-chat-generated-card__badges">
                                    <span className="pill">{item.priority}</span>
                                    <span className="pill">{item.required_role}</span>
                                    <span className={`pill ai-chat-generated-card__duplicate pill--${duplicateTone(item.duplicate_status)}`}>{item.duplicate_status.replace('_', ' ')}</span>
                                  </div>
                                </div>
                                {item.description ? <p className="ai-chat-generated-card__description">{item.description}</p> : null}
                                {item.duplicate_summary ? <small className="ai-chat-generated-card__summary">{item.duplicate_summary}</small> : null}
                                {item.duplicate_matches.length ? (
                                  <div className="ai-chat-generated-card__matches">
                                    {item.duplicate_matches.map((match) => (
                                      <span key={match.id} className="pill">#{match.id} {match.full_title}</span>
                                    ))}
                                  </div>
                                ) : null}
                                <div className="ai-chat-generated-card__actions">
                                  {item.review_status === 'pending' ? (
                                    <>
                                      <button type="button" className="button button--primary button--tiny" disabled={pendingItemId === item.id} onClick={() => void handleReviewAction(item, 'approve')}>
                                        {pendingItemId === item.id ? 'Saving...' : 'Approve'}
                                      </button>
                                      <button type="button" className="button button--ghost button--tiny" disabled={pendingItemId === item.id} onClick={() => void handleReviewAction(item, 'reject')}>
                                        Reject
                                      </button>
                                    </>
                                  ) : item.review_status === 'approved' ? (
                                    <>
                                      <span className="pill pill--success">Approved</span>
                                      {item.approved_batch_id ? <Link className="inline-link" to={`/app/checklist/batches/${item.approved_batch_id}`}>Open batch</Link> : null}
                                    </>
                                  ) : (
                                    <span className="pill">Rejected</span>
                                  )}
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="ai-chat-empty">
                    <strong>Start a checklist draft chat</strong>
                    <p>Choose a project target, upload module screenshots, and BugCatcher AI will draft checklist cards you can approve or reject one by one.</p>
                  </div>
                )}
              </div>

              <div className="ai-chat-composer">
                <div className="ai-chat-composer__toolbar">
                  <button type="button" className="button button--ghost button--tiny" onClick={() => fileInputRef.current?.click()} disabled={pending}>
                    Add screenshots
                  </button>
                  <span className="body-copy">{contextSaved ? 'At least one image is required for each new checklist draft request.' : 'Save or confirm the checklist target context before drafting items.'}</span>
                </div>
                {attachments.length ? (
                  <div className="ai-chat-selected-files">
                    {attachments.map((file) => (
                      <span key={`${file.name}-${file.size}`} className="pill">{file.name} • {formatFileSize(file.size)}</span>
                    ))}
                  </div>
                ) : null}
                <div className="ai-chat-composer__input">
                  <textarea
                    ref={textareaRef}
                    className="ai-chat-textarea"
                    placeholder="Describe the module or add extra testing guidance for the uploaded screenshots"
                    value={composer}
                    rows={1}
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    disabled={pending || !hasConfiguredRuntime}
                  />
                  <button type="button" className="button button--primary ai-chat-send" disabled={!canSend} onClick={() => void handleSend()}>
                    {pending ? 'Drafting...' : 'Draft'}
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={handleFileChange} />
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
