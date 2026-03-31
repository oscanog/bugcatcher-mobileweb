import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth-context'
import { AppTopBar, type AppShellOutletContext } from '../../components/layout'
import { Icon, ThemeToggle } from '../../components/ui'
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
  type AIChatThreadSummary,
  type AIGeneratedChecklistItem,
  type DraftContextPayload,
} from '../../features/ai-chat/api'
import { fetchChecklistBatches, type ChecklistBatch } from '../../features/checklist/api'
import { fetchProjects, type ProjectSummary } from '../../features/projects/api'
import { getErrorMessage } from '../../lib/api'
import { FormMessage, formatChatTime } from '../shared'

export type AIChatPageView = 'landing' | 'create' | 'thread'

type FlowStep = 1 | 2 | 3 | 4 | 5

type DraftFormState = {
  projectId: number
  targetMode: 'new' | 'existing'
  existingBatchId: number
  batchTitle: string
  moduleName: string
  submoduleName: string
  pageUrl: string
}

type SummaryRow = {
  label: string
  value: string
  step: Exclude<FlowStep, 5>
  href?: string
}

type ThreadStatusTone = 'draft' | 'review' | 'complete' | 'muted'

type ThreadStatus = {
  label: string
  tone: ThreadStatusTone
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

const flowSteps: Array<{ step: FlowStep; label: string; icon: 'projects' | 'checklist' | 'activity' | 'globe' | 'chat' }> = [
  { step: 1, label: 'Project', icon: 'projects' },
  { step: 2, label: 'Batch', icon: 'checklist' },
  { step: 3, label: 'Module', icon: 'activity' },
  { step: 4, label: 'Link', icon: 'globe' },
  { step: 5, label: 'Chat', icon: 'chat' },
]

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

function clampStep(value: number): FlowStep {
  if (value <= 1) {
    return 1
  }
  if (value === 2) {
    return 2
  }
  if (value === 3) {
    return 3
  }
  if (value === 4) {
    return 4
  }
  return 5
}

function getThreadTimestamp(thread: AIChatThreadSummary) {
  const rawValue = thread.last_message_at_iso || thread.updated_at_iso || thread.created_at_iso || thread.last_message_at || thread.updated_at || thread.created_at
  const parsed = Date.parse(rawValue || '')
  return Number.isFinite(parsed) ? parsed : 0
}

function sortThreads(threads: AIChatThreadSummary[]) {
  return [...threads].sort((left, right) => getThreadTimestamp(right) - getThreadTimestamp(left))
}

function formatThreadContextLabel(context?: AIChatDraftContext | null) {
  if (!context?.project_id) {
    return 'Checklist target not set'
  }
  if (context.target_mode === 'existing') {
    return `${context.project_name || 'Project'} / ${context.existing_batch_title || 'Existing batch'}`
  }
  return `${context.project_name || 'Project'} / ${context.batch_title || 'New batch'}`
}

function buildThreadSearchText(thread: AIChatThreadSummary) {
  const context = thread.draft_context
  return [thread.title, context.project_name, context.existing_batch_title, context.batch_title, context.module_name, context.submodule_name]
    .join(' ')
    .trim()
    .toLowerCase()
}

function deriveThreadStatus(thread?: AIChatThread | null, summary?: AIChatThreadSummary | null): ThreadStatus {
  const generatedItems = thread?.messages.flatMap((message) => message.generated_checklist_items) ?? []
  if (generatedItems.some((item) => item.review_status === 'pending')) {
    return { label: 'Needs review', tone: 'review' }
  }
  if (generatedItems.length > 0 && generatedItems.every((item) => item.review_status !== 'pending')) {
    return { label: 'Completed', tone: 'complete' }
  }
  if (thread?.draft_context.is_locked || summary?.draft_context.is_locked) {
    return { label: 'Completed', tone: 'complete' }
  }
  if (thread?.draft_context.project_id || summary?.draft_context.project_id) {
    return { label: 'Drafting', tone: 'draft' }
  }
  return { label: 'Set up', tone: 'muted' }
}

function getThreadModulePreview(summary: AIChatThreadSummary, detail?: AIChatThread | null) {
  const context = detail?.draft_context ?? summary.draft_context
  const moduleName = context.module_name?.trim()
  const submoduleName = context.submodule_name?.trim()
  if (moduleName && submoduleName) {
    return `${moduleName} / ${submoduleName}`
  }
  if (moduleName) {
    return moduleName
  }
  return 'Module details appear once the target is fully set'
}

function buildSummaryRows(form: DraftFormState, projects: ProjectSummary[], selectedBatch: ChecklistBatch | null, fallbackContext?: AIChatDraftContext | null) {
  const isExisting = form.targetMode === 'existing'
  const selectedProject = projects.find((project) => project.id === form.projectId) ?? null
  const projectName = selectedProject?.name || fallbackContext?.project_name || 'Not selected'
  const batchValue = isExisting
    ? selectedBatch?.title || fallbackContext?.existing_batch_title || 'No existing batch selected'
    : form.batchTitle.trim() || fallbackContext?.batch_title || 'Not set'
  const moduleValue = isExisting
    ? selectedBatch?.module_name || fallbackContext?.module_name || 'Module will follow the selected batch'
    : form.moduleName.trim() || fallbackContext?.module_name || 'Not set'
  const submoduleValue = isExisting
    ? selectedBatch?.submodule_name || fallbackContext?.submodule_name || ''
    : form.submoduleName.trim() || fallbackContext?.submodule_name || ''
  const pageUrl = isExisting ? selectedBatch?.page_url || fallbackContext?.page_url || '' : form.pageUrl.trim() || fallbackContext?.page_url || ''

  const rows: SummaryRow[] = [
    { label: 'Project', value: projectName, step: 1 },
    { label: 'Batch', value: batchValue, step: 2 },
    { label: 'Module', value: moduleValue, step: 3 },
  ]

  if (submoduleValue) {
    rows.push({ label: 'Submodule', value: submoduleValue, step: 3 })
  }

  rows.push({
    label: 'Page link',
    value: pageUrl || 'No saved page link',
    step: 4,
    href: pageUrl || undefined,
  })

  return {
    modeLabel: isExisting ? 'Existing batch' : 'New batch',
    rows,
  }
}

function buildThreadTitle(form: DraftFormState, selectedProject: ProjectSummary | null, selectedBatch: ChecklistBatch | null) {
  if (form.targetMode === 'existing') {
    return selectedBatch?.module_name || selectedBatch?.title || selectedProject?.name || 'New chat'
  }
  return form.moduleName.trim() || form.batchTitle.trim() || selectedProject?.name || 'New chat'
}

function normalizePositiveInt(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function AIChatHeader({ title, subtitle, leading, actions }: { title: string; subtitle: string; leading?: ReactNode; actions?: ReactNode }) {
  return (
    <AppTopBar eyebrow="AI Chat" title={title} subtitle={subtitle} leading={leading} actions={actions} />
  )
}

function AIChatStateScreen({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="ai-chat-page">
      <AIChatHeader title={title} subtitle={subtitle} actions={<ThemeToggle />} />
      <div className="ai-chat-page__body ai-chat-page__body--centered">
        <section className="ai-chat-state-card">{children}</section>
      </div>
    </div>
  )
}

function AIChatStatusPill({ status }: { status: ThreadStatus }) {
  return <span className={`pill ai-chat-status-pill ai-chat-status-pill--${status.tone}`}>{status.label}</span>
}

function AIChatHistoryCard({
  summary,
  detail,
  active = false,
  onOpen,
  onDelete,
}: {
  summary: AIChatThreadSummary
  detail?: AIChatThread | null
  active?: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const context = summary.draft_context
  const batchLabel = context.target_mode === 'existing' ? context.existing_batch_title || 'Existing batch' : context.batch_title || 'New batch'
  const preview = getThreadModulePreview(summary, detail)
  const status = deriveThreadStatus(detail, summary)

  return (
    <article
      className={`ai-chat-history-card ${active ? 'is-active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="ai-chat-history-card__body">
        <div className="ai-chat-history-card__headline">
          <strong>{summary.title}</strong>
          <AIChatStatusPill status={status} />
        </div>
        <p>{context.project_name || 'No project selected yet'}</p>
        <p>{batchLabel}</p>
        <small>{preview}</small>
      </div>
      <div className="ai-chat-history-card__aside">
        <span>{formatChatTime(summary.last_message_at || summary.updated_at || summary.created_at, summary.last_message_at_iso || summary.updated_at_iso || summary.created_at_iso)}</span>
        <button
          type="button"
          className="ai-chat-history-card__delete"
          aria-label={`Delete ${summary.title}`}
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
        >
          x
        </button>
      </div>
    </article>
  )
}

function AIChatProgress({ currentStep }: { currentStep: FlowStep }) {
  return (
    <div className="ai-chat-flow__progress">
      {flowSteps.map((item) => {
        const isComplete = item.step < currentStep
        const isActive = item.step === currentStep

        return (
          <div key={item.step} className={`ai-chat-flow__step ${isComplete ? 'is-complete' : ''} ${isActive ? 'is-active' : ''}`}>
            <span className="ai-chat-flow__step-icon" aria-hidden="true">
              {isComplete ? 'OK' : <Icon name={item.icon} />}
            </span>
            <span>{item.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function AIChatSummaryCard({
  modeLabel,
  rows,
  expanded,
  locked,
  onToggle,
  onEditStep,
}: {
  modeLabel: string
  rows: SummaryRow[]
  expanded: boolean
  locked: boolean
  onToggle: () => void
  onEditStep?: (step: Exclude<FlowStep, 5>) => void
}) {
  return (
    <section className="ai-chat-summary-card">
      <div className="ai-chat-summary-card__header">
        <div>
          <p className="eyebrow">Checklist summary</p>
          <h2>Target summary</h2>
        </div>
        <div className="ai-chat-summary-card__actions">
          <button type="button" className="button button--ghost button--tiny" onClick={onToggle}>
            {expanded ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {locked ? <p className="ai-chat-summary-card__note">This chat is locked because at least one generated checklist item was already approved.</p> : null}
      {expanded ? (
        <div className="ai-chat-summary-card__grid">
          {rows.map((row) => (
            <article key={`${row.label}-${row.step}`} className="ai-chat-summary-card__item">
              <div className="ai-chat-summary-card__item-copy">
                <div className="ai-chat-summary-card__item-label">
                  <span>{row.label}</span>
                  {row.label === 'Batch' ? <span className="ai-chat-summary-card__mode-badge">{modeLabel}</span> : null}
                </div>
                {row.href ? (
                  <a href={row.href} target="_blank" rel="noreferrer noopener">
                    {row.value}
                  </a>
                ) : (
                  <strong>{row.value}</strong>
                )}
              </div>
              {!locked && onEditStep ? (
                <button type="button" className="pill-button" onClick={() => onEditStep(row.step)}>
                  Edit
                </button>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function AIChatConversation({
  thread,
  assistantName,
  emptyTitle,
  emptyMessage,
  pendingItemId,
  onReviewAction,
}: {
  thread: AIChatThread | null
  assistantName: string
  emptyTitle: string
  emptyMessage: string
  pendingItemId?: number | null
  onReviewAction?: (item: AIGeneratedChecklistItem, action: 'approve' | 'reject') => void
}) {
  if (!thread?.messages.length) {
    return (
      <div className="ai-chat-conversation__empty">
        <strong>{emptyTitle}</strong>
        <p>{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="ai-chat-conversation__list">
      {thread.messages.map((messageItem) => (
        <article key={`${messageItem.role}-${messageItem.id}`} className={`ai-chat-bubble-row ai-chat-bubble-row--${messageItem.role}`}>
          <div className={`ai-chat-bubble ai-chat-bubble--${messageItem.role}`}>
            <span className="ai-chat-bubble__author">
              {messageItem.role === 'assistant' ? assistantName : 'You'} | {formatChatTime(messageItem.created_at, messageItem.created_at_iso)}
            </span>
            {messageItem.attachments.length ? (
              <div className="ai-chat-attachment-list">
                {messageItem.attachments.map((attachment) => (
                  <a
                    key={`${attachment.original_name}-${attachment.id}`}
                    className="ai-chat-attachment"
                    href={attachment.file_path || '#'}
                    target={attachment.file_path ? '_blank' : undefined}
                    rel={attachment.file_path ? 'noreferrer noopener' : undefined}
                  >
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
                        <span>
                          {item.module_name}
                          {item.submodule_name ? ` / ${item.submodule_name}` : ''}
                        </span>
                      </div>
                      <div className="ai-chat-generated-card__badges">
                        <span className="pill">{item.priority}</span>
                        <span className="pill">{item.required_role}</span>
                        <span className={`pill ai-chat-generated-card__duplicate pill--${duplicateTone(item.duplicate_status)}`}>
                          {item.duplicate_status.replaceAll('_', ' ')}
                        </span>
                      </div>
                    </div>
                    {item.description ? <p className="ai-chat-generated-card__description">{item.description}</p> : null}
                    {item.duplicate_summary ? <small className="ai-chat-generated-card__summary">{item.duplicate_summary}</small> : null}
                    {item.duplicate_matches.length ? (
                      <div className="ai-chat-generated-card__matches">
                        {item.duplicate_matches.map((match) => (
                          <span key={match.id} className="pill">
                            #{match.id} {match.full_title}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="ai-chat-generated-card__actions">
                      {item.review_status === 'pending' && onReviewAction ? (
                        <>
                          <button
                            type="button"
                            className="button button--primary button--tiny"
                            disabled={pendingItemId === item.id}
                            onClick={() => onReviewAction(item, 'approve')}
                          >
                            {pendingItemId === item.id ? 'Saving...' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            className="button button--ghost button--tiny"
                            disabled={pendingItemId === item.id}
                            onClick={() => onReviewAction(item, 'reject')}
                          >
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
      ))}
    </div>
  )
}

function AIChatComposer({
  composer,
  attachments,
  pending,
  canSend,
  disabled,
  helperText,
  onComposerChange,
  onAttachmentsChange,
  onSend,
}: {
  composer: string
  attachments: File[]
  pending: boolean
  canSend: boolean
  disabled: boolean
  helperText: string
  onComposerChange: (value: string) => void
  onAttachmentsChange: (files: File[]) => void
  onSend: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    textarea.style.height = '0px'
    const computed = window.getComputedStyle(textarea)
    const lineHeight = Number.parseFloat(computed.lineHeight || '22')
    const maxHeight = lineHeight * 4 + 18
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }, [composer])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (canSend) {
        onSend()
      }
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    onAttachmentsChange(Array.from(event.target.files ?? []))
  }

  return (
    <div className="ai-chat-compose">
      <div className="ai-chat-compose__toolbar">
        <button type="button" className="button button--ghost button--tiny" onClick={() => fileInputRef.current?.click()} disabled={disabled}>
          Add screenshots
        </button>
        <span>{helperText}</span>
      </div>
      {attachments.length ? (
        <div className="ai-chat-selected-files">
          {attachments.map((file) => (
            <span key={`${file.name}-${file.size}`} className="pill">
              {file.name} | {formatFileSize(file.size)}
            </span>
          ))}
        </div>
      ) : null}
      <div className="ai-chat-compose__input">
        <textarea
          ref={textareaRef}
          className="ai-chat-textarea"
          placeholder="Describe the module or add extra testing guidance for the uploaded screenshots"
          value={composer}
          rows={1}
          onChange={(event) => onComposerChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <button type="button" className="button button--primary ai-chat-send" disabled={!canSend} onClick={onSend}>
          {pending ? 'Drafting...' : 'Draft'}
        </button>
      </div>
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={handleFileChange} />
    </div>
  )
}

function AIChatLandingView({
  bootstrap,
  accessToken,
  activeOrgId,
}: {
  bootstrap: AIChatBootstrap
  accessToken: string
  activeOrgId: number
}) {
  const navigate = useNavigate()
  const { openDrawer } = useOutletContext<AppShellOutletContext>()
  const [threads, setThreads] = useState<AIChatThreadSummary[]>([])
  const [threadDetails, setThreadDetails] = useState<Record<number, AIChatThread>>({})
  const [searchValue, setSearchValue] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const deferredSearch = useDeferredValue(searchValue.trim().toLowerCase())

  useEffect(() => {
    let ignore = false

    const run = async () => {
      setLoading(true)
      try {
        const result = await fetchAIChatThreads(accessToken, activeOrgId)
        if (!ignore) {
          setThreads(sortThreads(result.threads))
          setError('')
        }
      } catch (loadError) {
        if (!ignore) {
          setError(getErrorMessage(loadError, 'Unable to load AI chat history.'))
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    void run()

    return () => {
      ignore = true
    }
  }, [accessToken, activeOrgId])

  useEffect(() => {
    if (!threads.length) {
      return
    }

    const threadIdsToLoad = threads.map((thread) => thread.id).filter((threadId) => !threadDetails[threadId])
    if (!threadIdsToLoad.length) {
      return
    }

    let ignore = false

    const run = async () => {
      const results = await Promise.allSettled(threadIdsToLoad.map((threadId) => fetchAIChatThread(accessToken, activeOrgId, threadId)))
      if (ignore) {
        return
      }

      setThreadDetails((current) => {
        const next = { ...current }
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            next[threadIdsToLoad[index]] = result.value.thread
          }
        })
        return next
      })
    }

    void run()

    return () => {
      ignore = true
    }
  }, [accessToken, activeOrgId, threadDetails, threads])

  const projectOptions = useMemo(() => {
    const projectMap = new Map<number, string>()
    threads.forEach((thread) => {
      if (thread.draft_context.project_id > 0) {
        projectMap.set(thread.draft_context.project_id, thread.draft_context.project_name || 'Unnamed project')
      }
    })

    return Array.from(projectMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [threads])

  const visibleThreads = useMemo(() => {
    return threads.filter((thread) => {
      const matchesProject = projectFilter === 'all' || `${thread.draft_context.project_id}` === projectFilter
      const matchesSearch = !deferredSearch || buildThreadSearchText(thread).includes(deferredSearch)
      return matchesProject && matchesSearch
    })
  }, [deferredSearch, projectFilter, threads])

  const handleDeleteThread = async (threadId: number) => {
    if (!window.confirm('Delete this checklist draft chat?')) {
      return
    }

    setError('')
    setMessage('')

    try {
      await deleteAIChatThread(accessToken, activeOrgId, threadId)
      setThreads((current) => current.filter((thread) => thread.id !== threadId))
      setThreadDetails((current) => {
        const next = { ...current }
        delete next[threadId]
        return next
      })
      setMessage('Chat deleted.')
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete the AI chat thread.'))
    }
  }

  return (
    <div className="ai-chat-page">
      <AIChatHeader
        title={bootstrap.assistant_name || 'BugCatcher AI'}
        subtitle="Browse old chats or start a new 5-step draft flow"
        leading={
          <button type="button" className="icon-button" aria-label="Open navigation drawer" onClick={openDrawer}>
            <Icon name="more" />
          </button>
        }
        actions={
          <>
            <ThemeToggle />
            <button type="button" className="button button--primary button--tiny" onClick={() => navigate('/app/ai-chat/new')}>
              New chat
            </button>
          </>
        }
      />

      <div className="ai-chat-page__body">
        {message ? <FormMessage tone="success">{message}</FormMessage> : null}
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}

        <section className="ai-chat-toolbar-card">
          <label className="ai-chat-search-field">
            <span className="ai-chat-search-field__icon" aria-hidden="true">
              <Icon name="search" />
            </span>
            <input
              className="input-inline ai-chat-search-field__input"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search by title, project, batch, or module"
            />
          </label>
          <select className="select-inline ai-chat-toolbar-card__filter" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
            <option value="all">All projects</option>
            {projectOptions.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </section>

        {loading ? (
          <section className="ai-chat-state-card">
            <p className="body-copy">Loading chat history...</p>
          </section>
        ) : visibleThreads.length ? (
          <div className="ai-chat-history-list">
            {visibleThreads.map((thread) => (
              <AIChatHistoryCard
                key={thread.id}
                summary={thread}
                detail={threadDetails[thread.id]}
                onOpen={() => navigate(`/app/ai-chat/threads/${thread.id}`)}
                onDelete={() => void handleDeleteThread(thread.id)}
              />
            ))}
          </div>
        ) : (
          <section className="ai-chat-state-card">
            <strong>{threads.length ? 'No chats match that search yet' : 'No AI chats yet'}</strong>
            <p>{threads.length ? 'Try another keyword or reset the project filter.' : 'Start your first AI checklist draft from the New chat button.'}</p>
          </section>
        )}
      </div>
    </div>
  )
}

function AIChatCreateView({
  bootstrap,
  accessToken,
  activeOrgId,
}: {
  bootstrap: AIChatBootstrap
  accessToken: string
  activeOrgId: number
}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editThreadId = normalizePositiveInt(searchParams.get('threadId'))
  const queryStep = clampStep(normalizePositiveInt(searchParams.get('step')) ?? 1)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [availableBatches, setAvailableBatches] = useState<ChecklistBatch[]>([])
  const [editingThread, setEditingThread] = useState<AIChatThread | null>(null)
  const [draftForm, setDraftForm] = useState<DraftFormState>(emptyDraftForm)
  const [step, setStep] = useState<FlowStep>(queryStep)
  const [composer, setComposer] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [summaryExpanded, setSummaryExpanded] = useState(true)
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [loadingThread, setLoadingThread] = useState(Boolean(editThreadId))
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let ignore = false

    const run = async () => {
      setLoadingProjects(true)
      try {
        const result = await fetchProjects(accessToken, activeOrgId, 'active')
        if (!ignore) {
          setProjects(result.projects)
        }
      } catch (loadError) {
        if (!ignore) {
          setError(getErrorMessage(loadError, 'Unable to load projects for checklist drafting.'))
        }
      } finally {
        if (!ignore) {
          setLoadingProjects(false)
        }
      }
    }

    void run()

    return () => {
      ignore = true
    }
  }, [accessToken, activeOrgId])

  useEffect(() => {
    if (!editThreadId) {
      setLoadingThread(false)
      setEditingThread(null)
      setStep(queryStep)
      return
    }

    let ignore = false

    const run = async () => {
      setLoadingThread(true)
      try {
        const result = await fetchAIChatThread(accessToken, activeOrgId, editThreadId)
        if (ignore) {
          return
        }

        if (result.thread.draft_context.is_locked) {
          navigate(`/app/ai-chat/threads/${editThreadId}`, { replace: true })
          return
        }

        setEditingThread(result.thread)
        setDraftForm(draftContextToForm(result.thread.draft_context))
        setStep(queryStep)
        setError('')
      } catch (loadError) {
        if (!ignore) {
          setError(getErrorMessage(loadError, 'Unable to load the selected AI chat thread.'))
        }
      } finally {
        if (!ignore) {
          setLoadingThread(false)
        }
      }
    }

    void run()

    return () => {
      ignore = true
    }
  }, [accessToken, activeOrgId, editThreadId, navigate, queryStep])

  useEffect(() => {
    if (draftForm.projectId <= 0) {
      setAvailableBatches([])
      setLoadingBatches(false)
      return
    }

    let ignore = false

    const run = async () => {
      setLoadingBatches(true)
      try {
        const result = await fetchChecklistBatches(accessToken, activeOrgId, { projectId: draftForm.projectId })
        if (!ignore) {
          setAvailableBatches(result.batches)
          setError('')
        }
      } catch (loadError) {
        if (!ignore) {
          setError(getErrorMessage(loadError, 'Unable to load checklist batches for the selected project.'))
        }
      } finally {
        if (!ignore) {
          setLoadingBatches(false)
        }
      }
    }

    void run()

    return () => {
      ignore = true
    }
  }, [accessToken, activeOrgId, draftForm.projectId])

  const selectedProject = useMemo(() => projects.find((project) => project.id === draftForm.projectId) ?? null, [draftForm.projectId, projects])
  const selectedExistingBatch = useMemo(
    () => availableBatches.find((batch) => batch.id === draftForm.existingBatchId) ?? null,
    [availableBatches, draftForm.existingBatchId],
  )
  const summary = useMemo(
    () => buildSummaryRows(draftForm, projects, selectedExistingBatch, editingThread?.draft_context),
    [draftForm, editingThread?.draft_context, projects, selectedExistingBatch],
  )

  const contextLocked = Boolean(editingThread?.draft_context.is_locked)
  const contextChanged = Boolean(editingThread && !formMatchesContext(draftForm, editingThread.draft_context))
  const canSend = Boolean(bootstrap.enabled && !pending && attachments.length > 0)

  const handleBack = () => {
    if (step === 1) {
      navigate(editThreadId ? `/app/ai-chat/threads/${editThreadId}` : '/app/ai-chat')
      return
    }
    setStep((current) => clampStep(current - 1))
  }

  const validateStep = (currentStep: FlowStep) => {
    if (currentStep === 1 && draftForm.projectId <= 0) {
      return 'Select a project before continuing.'
    }
    if (currentStep === 2) {
      if (draftForm.targetMode === 'existing' && draftForm.existingBatchId <= 0) {
        return loadingBatches ? 'Wait until checklist batches finish loading.' : 'Select an existing batch or choose New batch.'
      }
      if (draftForm.targetMode === 'new' && !draftForm.batchTitle.trim()) {
        return 'Enter a batch title before continuing.'
      }
    }
    if (currentStep === 3 && draftForm.targetMode === 'new' && !draftForm.moduleName.trim()) {
      return 'Enter a module name before continuing.'
    }
    if (currentStep === 4 && draftForm.targetMode === 'new' && !isValidPageUrl(draftForm.pageUrl.trim())) {
      return 'Enter a valid page link before continuing.'
    }
    return ''
  }

  const handleNext = () => {
    const validationError = validateStep(step)
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setSummaryExpanded(true)
    setStep((current) => clampStep(current + 1))
  }

  const handleEditStep = (targetStep: Exclude<FlowStep, 5>) => {
    if (!contextLocked) {
      setStep(targetStep)
    }
  }

  const ensureThread = async () => {
    if (editingThread) {
      return { threadId: editingThread.id, thread: editingThread }
    }

    const result = await createAIChatThread(accessToken, activeOrgId, buildThreadTitle(draftForm, selectedProject, selectedExistingBatch))
    setEditingThread(result.thread)
    return { threadId: result.thread.id, thread: result.thread }
  }

  const syncThreadContext = async () => {
    const payload = buildDraftPayload(draftForm)
    const { threadId, thread } = await ensureThread()

    if (formMatchesContext(draftForm, thread.draft_context)) {
      return { threadId, thread }
    }

    const result = await updateAIChatDraftContext(accessToken, activeOrgId, threadId, payload)
    setEditingThread(result.thread)
    return { threadId, thread: result.thread }
  }

  const handleSend = async () => {
    const validationError = validateStep(1) || validateStep(2) || validateStep(3) || validateStep(4)
    if (validationError) {
      setError(validationError)
      return
    }
    if (!attachments.length) {
      setError('Upload at least one image before generating checklist draft items.')
      return
    }

    setPending(true)
    setError('')

    try {
      const { threadId } = await syncThreadContext()
      const result = await createChecklistDraft(accessToken, activeOrgId, threadId, composer.trim(), attachments)
      navigate(`/app/ai-chat/threads/${result.thread.id}`, { replace: true })
    } catch (sendError) {
      setError(getErrorMessage(sendError, 'Unable to draft checklist items from the uploaded module screenshots.'))
    } finally {
      setPending(false)
    }
  }

  const existingModuleName = selectedExistingBatch?.module_name || editingThread?.draft_context.module_name || ''
  const existingSubmoduleName = selectedExistingBatch?.submodule_name || editingThread?.draft_context.submodule_name || ''
  const existingPageUrl = selectedExistingBatch?.page_url || editingThread?.draft_context.page_url || ''

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <section className="ai-chat-flow-card">
            <div className="ai-chat-flow-card__header">
              <h2>Select project</h2>
              <p>Choose where the generated checklist cards will belong.</p>
            </div>
            <div className="ai-chat-choice-list">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={`ai-chat-choice-card ${draftForm.projectId === project.id ? 'is-selected' : ''}`}
                  onClick={() => {
                    setDraftForm((current) => ({ ...current, projectId: project.id, existingBatchId: current.projectId === project.id ? current.existingBatchId : 0 }))
                    setError('')
                  }}
                >
                  <span className="icon-wrap">
                    <Icon name="projects" />
                  </span>
                  <span className="ai-chat-choice-card__copy">
                    <strong>{project.name}</strong>
                    <small>{project.org_name || 'Active project'}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )
      case 2:
        return (
          <section className="ai-chat-flow-card">
            <div className="ai-chat-flow-card__header">
              <h2>Batch</h2>
              <p>Choose whether this draft should create a new batch or insert cards into an existing one.</p>
            </div>
            <div className="ai-chat-choice-list">
              <button
                type="button"
                className={`ai-chat-choice-card ${draftForm.targetMode === 'new' ? 'is-selected' : ''}`}
                onClick={() => {
                  setDraftForm((current) => ({ ...current, targetMode: 'new' }))
                  setError('')
                }}
              >
                <span className="icon-wrap">
                  <Icon name="checklist" />
                </span>
                <span className="ai-chat-choice-card__copy">
                  <strong>New batch</strong>
                  <small>Create a brand new checklist batch for this target.</small>
                </span>
              </button>
              {loadingBatches ? <div className="ai-chat-inline-note">Loading checklist batches for this project...</div> : null}
              {availableBatches.map((batch) => (
                <button
                  key={batch.id}
                  type="button"
                  className={`ai-chat-choice-card ${draftForm.targetMode === 'existing' && draftForm.existingBatchId === batch.id ? 'is-selected' : ''}`}
                  onClick={() => {
                    setDraftForm((current) => ({ ...current, targetMode: 'existing', existingBatchId: batch.id }))
                    setError('')
                  }}
                >
                  <span className="icon-wrap">
                    <Icon name="organization" />
                  </span>
                  <span className="ai-chat-choice-card__copy">
                    <strong>{batch.title}</strong>
                    <small>
                      {batch.module_name}
                      {batch.submodule_name ? ` / ${batch.submodule_name}` : ''}
                    </small>
                  </span>
                </button>
              ))}
              {!loadingBatches && draftForm.projectId > 0 && availableBatches.length === 0 ? (
                <div className="ai-chat-inline-note">No existing checklist batches were found for this project yet.</div>
              ) : null}
            </div>
            {draftForm.targetMode === 'new' ? (
              <div className="inline-form">
                <input className="input-inline" value={draftForm.batchTitle} onChange={(event) => setDraftForm((current) => ({ ...current, batchTitle: event.target.value }))} placeholder="Batch title" />
              </div>
            ) : (
              <p className="body-copy">Existing batch mode will reuse the selected batch details in steps 3 and 4.</p>
            )}
          </section>
        )
      case 3:
        return (
          <section className="ai-chat-flow-card">
            <div className="ai-chat-flow-card__header">
              <h2>Module</h2>
              <p>Confirm the module and optional submodule that the screenshots belong to.</p>
            </div>
            {draftForm.targetMode === 'new' ? (
              <div className="inline-form">
                <input className="input-inline" value={draftForm.moduleName} onChange={(event) => setDraftForm((current) => ({ ...current, moduleName: event.target.value }))} placeholder="Module name" />
                <input className="input-inline" value={draftForm.submoduleName} onChange={(event) => setDraftForm((current) => ({ ...current, submoduleName: event.target.value }))} placeholder="Submodule name (optional)" />
              </div>
            ) : (
              <div className="ai-chat-readonly-stack">
                <div className="ai-chat-readonly-card">
                  <span>Module</span>
                  <strong>{existingModuleName || 'No module stored for this batch yet'}</strong>
                </div>
                <div className="ai-chat-readonly-card">
                  <span>Submodule</span>
                  <strong>{existingSubmoduleName || 'No submodule saved'}</strong>
                </div>
              </div>
            )}
          </section>
        )
      case 4:
        return (
          <section className="ai-chat-flow-card">
            <div className="ai-chat-flow-card__header">
              <h2>Website page link</h2>
              <p>Connect this draft to the exact page or screen the screenshots came from.</p>
            </div>
            {draftForm.targetMode === 'new' ? (
              <div className="inline-form">
                <input className="input-inline" value={draftForm.pageUrl} onChange={(event) => setDraftForm((current) => ({ ...current, pageUrl: event.target.value }))} placeholder="https://..." inputMode="url" />
              </div>
            ) : (
              <div className="ai-chat-readonly-stack">
                <div className="ai-chat-readonly-card">
                  <span>Saved page link</span>
                  <strong>{existingPageUrl || 'This existing batch does not have a saved page link yet.'}</strong>
                </div>
                {existingPageUrl ? <a className="inline-link" href={existingPageUrl} target="_blank" rel="noreferrer noopener">Open saved page link</a> : null}
              </div>
            )}
            <div className="ai-chat-inline-note ai-chat-inline-note--info">
              Each approved AI card is inserted immediately into the real checklist under this connected project target.
            </div>
          </section>
        )
      case 5:
        return (
          <div className="ai-chat-thread-stage">
            {contextChanged ? <FormMessage tone="info">Your edited target summary will be saved with the next draft request.</FormMessage> : null}
            <AIChatSummaryCard modeLabel={summary.modeLabel} rows={summary.rows} expanded={summaryExpanded} locked={contextLocked} onToggle={() => setSummaryExpanded((current) => !current)} onEditStep={handleEditStep} />
            {editingThread?.messages.length ? (
              <section className="ai-chat-thread-stage__conversation">
                <AIChatConversation thread={editingThread} assistantName={bootstrap.assistant_name || 'BugCatcher AI'} emptyTitle="" emptyMessage="" />
              </section>
            ) : null}
            <AIChatComposer
              composer={composer}
              attachments={attachments}
              pending={pending}
              canSend={canSend}
              disabled={pending}
              helperText="At least one image is required for each draft request."
              onComposerChange={setComposer}
              onAttachmentsChange={setAttachments}
              onSend={() => void handleSend()}
            />
          </div>
        )
    }
  }

  return (
    <div className="ai-chat-page">
      <AIChatHeader
        title={editThreadId ? 'Edit chat target' : 'New chat'}
        subtitle={step === 5 ? 'Review your summary and start drafting' : `Step ${step} of 5`}
        leading={<button type="button" className="icon-button ai-chat-back-button" aria-label="Go back" onClick={handleBack}><Icon name="arrow" /></button>}
        actions={<ThemeToggle />}
      />
      <div className="ai-chat-page__body">
        <AIChatProgress currentStep={step} />
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        {loadingProjects || loadingThread ? (
          <section className="ai-chat-state-card">
            <p className="body-copy">Loading create chat flow...</p>
          </section>
        ) : (
          <>
            {renderStep()}
            {step < 5 ? (
              <div className="ai-chat-flow__footer">
                <button type="button" className="button button--ghost" onClick={handleBack}>
                  {step === 1 ? 'Back to history' : 'Back'}
                </button>
                <button type="button" className="button button--primary" onClick={handleNext}>
                  {step === 4 ? 'Continue to chat' : 'Next'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function AIChatThreadView({
  bootstrap,
  accessToken,
  activeOrgId,
}: {
  bootstrap: AIChatBootstrap
  accessToken: string
  activeOrgId: number
}) {
  const navigate = useNavigate()
  const { threadId } = useParams()
  const activeThreadId = normalizePositiveInt(threadId ?? null)
  const [threads, setThreads] = useState<AIChatThreadSummary[]>([])
  const [activeThread, setActiveThread] = useState<AIChatThread | null>(null)
  const [composer, setComposer] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [summaryExpanded, setSummaryExpanded] = useState(true)
  const [railOpen, setRailOpen] = useState(false)
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingThread, setLoadingThread] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [pendingItemId, setPendingItemId] = useState<number | null>(null)

  useEffect(() => {
    let ignore = false

    const run = async () => {
      setLoadingThreads(true)
      try {
        const result = await fetchAIChatThreads(accessToken, activeOrgId)
        if (!ignore) {
          setThreads(sortThreads(result.threads))
        }
      } catch (loadError) {
        if (!ignore) {
          setError(getErrorMessage(loadError, 'Unable to load AI chat history.'))
        }
      } finally {
        if (!ignore) {
          setLoadingThreads(false)
        }
      }
    }

    void run()

    return () => {
      ignore = true
    }
  }, [accessToken, activeOrgId])

  useEffect(() => {
    if (!activeThreadId) {
      setLoadingThread(false)
      setActiveThread(null)
      setError('AI chat thread not found.')
      return
    }

    let ignore = false

    const run = async () => {
      setLoadingThread(true)
      try {
        const result = await fetchAIChatThread(accessToken, activeOrgId, activeThreadId)
        if (!ignore) {
          setActiveThread(result.thread)
          setError('')
        }
      } catch (loadError) {
        if (!ignore) {
          setError(getErrorMessage(loadError, 'Unable to load AI chat thread.'))
          setActiveThread(null)
        }
      } finally {
        if (!ignore) {
          setLoadingThread(false)
        }
      }
    }

    void run()

    return () => {
      ignore = true
    }
  }, [accessToken, activeOrgId, activeThreadId])

  const summary = useMemo(() => buildSummaryRows(draftContextToForm(activeThread?.draft_context), [], null, activeThread?.draft_context), [activeThread?.draft_context])
  const canSend = Boolean(bootstrap.enabled && activeThread?.draft_context.is_ready && !pending && attachments.length > 0)

  const refreshThreads = async () => {
    const result = await fetchAIChatThreads(accessToken, activeOrgId)
    setThreads(sortThreads(result.threads))
  }

  const handleDeleteThread = async (threadIdToDelete: number) => {
    if (!window.confirm('Delete this checklist draft chat?')) {
      return
    }

    setError('')
    setMessage('')

    try {
      await deleteAIChatThread(accessToken, activeOrgId, threadIdToDelete)
      const remainingThreads = threads.filter((thread) => thread.id !== threadIdToDelete)
      setThreads(remainingThreads)

      if (threadIdToDelete === activeThreadId) {
        navigate('/app/ai-chat', { replace: true })
        return
      }

      setMessage('Chat deleted.')
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete the AI chat thread.'))
    }
  }

  const handleSend = async () => {
    if (!activeThreadId || !activeThread?.draft_context.is_ready) {
      setError('Edit the checklist target before drafting more items.')
      return
    }
    if (!attachments.length) {
      setError('Upload at least one image before generating checklist draft items.')
      return
    }

    setPending(true)
    setError('')
    setMessage('')

    try {
      const result = await createChecklistDraft(accessToken, activeOrgId, activeThreadId, composer.trim(), attachments)
      setActiveThread(result.thread)
      setComposer('')
      setAttachments([])
      await refreshThreads()
    } catch (sendError) {
      setError(getErrorMessage(sendError, 'Unable to draft checklist items from the uploaded module screenshots.'))
    } finally {
      setPending(false)
    }
  }

  const handleReviewAction = async (item: AIGeneratedChecklistItem, action: 'approve' | 'reject') => {
    if (!activeThreadId) {
      return
    }

    setPendingItemId(item.id)
    setError('')
    setMessage('')

    try {
      if (action === 'approve') {
        await approveGeneratedChecklistItem(accessToken, activeOrgId, item.id)
        setMessage(`"${item.title}" was added to the checklist batch.`)
      } else {
        await rejectGeneratedChecklistItem(accessToken, activeOrgId, item.id)
        setMessage(`"${item.title}" was rejected.`)
      }

      const [threadResult] = await Promise.all([fetchAIChatThread(accessToken, activeOrgId, activeThreadId), refreshThreads()])
      setActiveThread(threadResult.thread)
    } catch (actionError) {
      setError(getErrorMessage(actionError, `Unable to ${action} the generated checklist item.`))
    } finally {
      setPendingItemId(null)
    }
  }

  return (
    <div className="ai-chat-page ai-chat-page--thread">
      <AIChatHeader
        title={activeThread?.title || bootstrap.assistant_name || 'BugCatcher AI'}
        subtitle={activeThread ? formatThreadContextLabel(activeThread.draft_context) : 'Open an AI draft thread'}
        leading={<button type="button" className="icon-button ai-chat-back-button" aria-label="Back to AI chat landing page" onClick={() => navigate('/app/ai-chat')}><Icon name="arrow" /></button>}
        actions={
          <>
            <ThemeToggle />
            <button type="button" className="icon-button" aria-label="Open conversation history" onClick={() => setRailOpen((current) => !current)}>
              <Icon name="more" />
            </button>
          </>
        }
      />
      <div className="ai-chat-page__body ai-chat-page__body--thread">
        {message ? <FormMessage tone="success">{message}</FormMessage> : null}
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}

        <button type="button" className={`ai-chat-thread-drawer__backdrop ${railOpen ? 'is-open' : ''}`} aria-label="Close conversation history" onClick={() => setRailOpen(false)} />

        <aside className={`ai-chat-thread-drawer ${railOpen ? 'is-open' : ''}`}>
          <div className="ai-chat-thread-drawer__header">
            <div>
              <p className="eyebrow">Recent chats</p>
              <h2>History</h2>
            </div>
            <button type="button" className="button button--primary button--tiny" onClick={() => navigate('/app/ai-chat/new')}>
              New chat
            </button>
          </div>
          {loadingThreads ? (
            <p className="body-copy">Loading history...</p>
          ) : (
            <div className="ai-chat-history-list ai-chat-history-list--drawer">
              {threads.map((thread) => (
                <AIChatHistoryCard
                  key={thread.id}
                  summary={thread}
                  active={thread.id === activeThreadId}
                  onOpen={() => {
                    setRailOpen(false)
                    navigate(`/app/ai-chat/threads/${thread.id}`)
                  }}
                  onDelete={() => void handleDeleteThread(thread.id)}
                />
              ))}
            </div>
          )}
        </aside>

        {loadingThread ? (
          <section className="ai-chat-state-card">
            <p className="body-copy">Loading chat thread...</p>
          </section>
        ) : activeThread ? (
          <div className="ai-chat-thread-stage">
            <AIChatSummaryCard
              modeLabel={summary.modeLabel}
              rows={summary.rows}
              expanded={summaryExpanded}
              locked={Boolean(activeThread.draft_context.is_locked)}
              onToggle={() => setSummaryExpanded((current) => !current)}
              onEditStep={activeThread.draft_context.is_locked ? undefined : (targetStep) => navigate(`/app/ai-chat/new?threadId=${activeThread.id}&step=${targetStep}`)}
            />
            <section className="ai-chat-thread-stage__conversation">
              <AIChatConversation
                thread={activeThread}
                assistantName={bootstrap.assistant_name || 'BugCatcher AI'}
                emptyTitle="No conversation yet"
                emptyMessage="This chat is ready for your first screenshot-based checklist draft."
                pendingItemId={pendingItemId}
                onReviewAction={(item, action) => void handleReviewAction(item, action)}
              />
            </section>
            <AIChatComposer
              composer={composer}
              attachments={attachments}
              pending={pending}
              canSend={canSend}
              disabled={pending || !activeThread.draft_context.is_ready}
              helperText={activeThread.draft_context.is_ready ? 'At least one image is required for each new checklist draft request.' : 'Edit the checklist target before drafting new checklist items.'}
              onComposerChange={setComposer}
              onAttachmentsChange={setAttachments}
              onSend={() => void handleSend()}
            />
          </div>
        ) : (
          <section className="ai-chat-state-card">
            <strong>Thread unavailable</strong>
            <p>The selected chat could not be loaded. Return to the AI chat landing page and choose another thread.</p>
          </section>
        )}
      </div>
    </div>
  )
}

export function AIChatPage({ view = 'landing' }: { view?: AIChatPageView }) {
  const { activeOrgId, session } = useAuth()
  const accessToken = session?.accessToken ?? ''
  const [bootstrap, setBootstrap] = useState<AIChatBootstrap | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!activeOrgId || !accessToken) {
      return
    }

    let ignore = false

    const run = async () => {
      try {
        const result = await fetchAIChatBootstrap(accessToken, activeOrgId)
        if (!ignore) {
          setBootstrap(result)
          setError('')
        }
      } catch (loadError) {
        if (!ignore) {
          setError(getErrorMessage(loadError, 'Unable to load AI checklist drafting configuration.'))
        }
      }
    }

    void run()

    return () => {
      ignore = true
    }
  }, [accessToken, activeOrgId])

  if (!activeOrgId) {
    return (
      <AIChatStateScreen title="AI Chat" subtitle="Checklist drafting assistant">
        <strong>Select an active organization first</strong>
        <p>The AI chat is only available inside a specific organization workspace.</p>
      </AIChatStateScreen>
    )
  }

  if (!bootstrap && !error) {
    return (
      <AIChatStateScreen title="AI Chat" subtitle="Checklist drafting assistant">
        <p className="body-copy">Loading AI chat...</p>
      </AIChatStateScreen>
    )
  }

  if (error && !bootstrap) {
    return (
      <AIChatStateScreen title="AI Chat" subtitle="Checklist drafting assistant">
        <FormMessage tone="error">{error}</FormMessage>
      </AIChatStateScreen>
    )
  }

  if (!bootstrap?.enabled) {
    return (
      <AIChatStateScreen title="AI Checklist Drafting Setup" subtitle="Super Admin configuration is required">
        <div className="bullet-stack">
          <div className="bullet-row">
            <span className="bullet-row__marker" />
            <p>{bootstrap?.error_message || 'AI checklist drafting is not configured correctly. Go to Super Admin > AI Admin.'}</p>
          </div>
          <div className="bullet-row">
            <span className="bullet-row__marker" />
            <p>Choose a vision-capable model because this page works from module screenshots.</p>
          </div>
        </div>
      </AIChatStateScreen>
    )
  }

  if (view === 'create') {
    return <AIChatCreateView bootstrap={bootstrap} accessToken={accessToken} activeOrgId={activeOrgId} />
  }

  if (view === 'thread') {
    return <AIChatThreadView bootstrap={bootstrap} accessToken={accessToken} activeOrgId={activeOrgId} />
  }

  return <AIChatLandingView bootstrap={bootstrap} accessToken={accessToken} activeOrgId={activeOrgId} />
}
