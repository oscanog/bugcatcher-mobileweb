import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth-context'
import { Icon, ListRow, SectionCard } from '../../components/ui'
import { canManageChecklist } from '../../lib/access'
import { getErrorMessage } from '../../lib/api'
import {
  fetchChecklistBatch,
  fetchChecklistBatches,
  fetchChecklistItem,
  updateChecklistBatch,
  updateChecklistItem,
  type ChecklistAttachment,
  type ChecklistAssigneeOption,
  type ChecklistBatch,
  type ChecklistBatchDetailResponse,
  type ChecklistBatchesResponse,
  type ChecklistItem,
} from '../../features/checklist/api'
import { EmptySection, FormMessage, LoadingSection } from '../shared'

type SelectionMenuPosition = {
  top: number
  left: number
  width: number
  maxHeight: number
  placement: 'top' | 'bottom'
}

type SelectionMenuOption = {
  value: number
  label: string
  description: string
}

function isImageAttachment(attachment: ChecklistAttachment) {
  return (attachment.mime_type || '').startsWith('image/')
}

function formatStatusLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function initialsFromName(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (!parts.length) {
    return 'QA'
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join('')
}

function compactPageLinkLabel(pageUrl: string) {
  try {
    const url = new URL(pageUrl)
    const path = url.pathname === '/' ? '' : url.pathname
    return `${url.hostname}${path}`.replace(/\/$/, '')
  } catch {
    return pageUrl.replace(/^https?:\/\//i, '')
  }
}

function ChecklistSelectionMenu({
  open,
  anchorElement,
  menuId,
  title,
  subtitle,
  options,
  selectedValue,
  pending,
  emptyMessage,
  onClose,
  onSelect,
}: {
  open: boolean
  anchorElement: HTMLButtonElement | null
  menuId: string
  title: string
  subtitle: string
  options: SelectionMenuOption[]
  selectedValue: number
  pending: boolean
  emptyMessage: string
  onClose: () => void
  onSelect: (value: number) => void
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<SelectionMenuPosition | null>(null)

  const updatePosition = useCallback(() => {
    if (!open || !anchorElement || typeof window === 'undefined') {
      return
    }

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const margin = 8
    const gap = 8
    const anchorRect = anchorElement.getBoundingClientRect()
    const measuredHeight = menuRef.current?.offsetHeight ?? Math.min(280, Math.round(viewportHeight * 0.45))
    const width = Math.min(Math.max(anchorRect.width, 220), Math.max(220, viewportWidth - margin * 2))
    const spaceBelow = Math.max(viewportHeight - anchorRect.bottom - margin - gap, 0)
    const spaceAbove = Math.max(anchorRect.top - margin - gap, 0)
    const openUpward = spaceBelow < measuredHeight && spaceAbove > spaceBelow
    const maxHeight = Math.max(Math.min(openUpward ? spaceAbove : spaceBelow, 320), 120)
    const visibleHeight = Math.min(measuredHeight, maxHeight)
    const left = Math.min(
      Math.max(anchorRect.right - width, margin),
      Math.max(margin, viewportWidth - width - margin),
    )
    const top = openUpward
      ? Math.max(margin, anchorRect.top - visibleHeight - gap)
      : Math.min(anchorRect.bottom + gap, Math.max(margin, viewportHeight - visibleHeight - margin))

    setPosition({
      top,
      left,
      width,
      maxHeight,
      placement: openUpward ? 'top' : 'bottom',
    })
  }, [anchorElement, open])

  useEffect(() => {
    if (!open) {
      return
    }

    let frameId = 0
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(updatePosition)
    }

    scheduleUpdate()
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('scroll', scheduleUpdate, true)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('scroll', scheduleUpdate, true)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (target && (menuRef.current?.contains(target) || anchorElement?.contains(target))) {
        return
      }
      onClose()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [anchorElement, onClose, open])

  if (!open || !anchorElement || typeof document === 'undefined') {
    return null
  }

  const style: CSSProperties = position
    ? {
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
        maxHeight: `${position.maxHeight}px`,
      }
    : {
        top: '0',
        left: '0',
        width: `${Math.min(Math.max(anchorElement.getBoundingClientRect().width, 220), 320)}px`,
        visibility: 'hidden',
      }

  return createPortal(
    <div
      ref={menuRef}
      id={menuId}
      className={`checklist-assignee-menu ${position?.placement === 'top' ? 'checklist-assignee-menu--top' : 'checklist-assignee-menu--bottom'}`}
      role="menu"
      aria-label={title}
      style={style}
    >
      <div className="checklist-assignee-menu__header">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="checklist-assignee-menu__list">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`checklist-assignee-menu__option ${selectedValue === option.value ? 'is-active' : ''}`}
            role="menuitemradio"
            aria-checked={selectedValue === option.value}
            disabled={pending}
            onClick={() => onSelect(option.value)}
          >
            <span>{option.label}</span>
            <small>{option.description}</small>
          </button>
        ))}
      </div>
      {options.length <= 1 ? <p className="checklist-assignee-menu__empty">{emptyMessage}</p> : null}
    </div>,
    document.body,
  )
}

function BatchSummaryCard({
  batch,
  items,
  canManageBatch,
  isSavingBatchLead,
  isBatchLeadMenuOpen,
  onBatchLeadTrigger,
}: {
  batch: ChecklistBatch
  items: ChecklistItem[]
  canManageBatch: boolean
  isSavingBatchLead: boolean
  isBatchLeadMenuOpen: boolean
  onBatchLeadTrigger: (event: ReactMouseEvent<HTMLButtonElement>) => void
}) {
  const summary = useMemo(() => {
    const counts = {
      total: items.length,
      open: 0,
      inProgress: 0,
      done: 0,
      blocked: 0,
    }

    items.forEach((item) => {
      if (item.status === 'open') {
        counts.open += 1
        return
      }
      if (item.status === 'in_progress') {
        counts.inProgress += 1
        return
      }
      if (item.status === 'blocked') {
        counts.blocked += 1
        return
      }
      if (item.status === 'passed' || item.status === 'failed') {
        counts.done += 1
      }
    })

    return {
      ...counts,
      completionPercent: counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0,
    }
  }, [items])
  const metaLine = [batch.project_name, batch.module_name, batch.submodule_name || null].filter(Boolean).join(' | ')

  return (
    <section className="section-card checklist-batch-hero-card">
      <div className="section-card__body checklist-batch-hero-card__body">
        <div className="checklist-batch-hero-card__header">
          <div className="checklist-batch-hero-card__copy">
            <p className="eyebrow">{batch.org_name || 'Organization'}</p>
            <h2>{batch.title}</h2>
            <p className="checklist-batch-hero-card__meta-line">{metaLine}</p>
          </div>
          <ChecklistBatchLeadBadge
            batch={batch}
            canManageBatch={canManageBatch}
            isSavingBatchLead={isSavingBatchLead}
            isBatchLeadMenuOpen={isBatchLeadMenuOpen}
            onBatchLeadTrigger={onBatchLeadTrigger}
          />
        </div>

        <div className="checklist-batch-hero-card__chips">
          <span className="pill pill--dark checklist-batch-hero-card__pill">
            <Icon name="activity" />
            {formatStatusLabel(batch.status)}
          </span>
          {batch.page_url ? (
            <a
              className="pill checklist-batch-hero-card__pill checklist-batch-hero-card__pill--link"
              href={batch.page_url}
              target="_blank"
              rel="noreferrer noopener"
              title={batch.page_url}
            >
              <Icon name="globe" />
              <span className="checklist-batch-hero-card__pill-label">{compactPageLinkLabel(batch.page_url)}</span>
            </a>
          ) : (
            <span className="pill checklist-batch-hero-card__pill">
              <Icon name="globe" />
              No page link
            </span>
          )}
          <span className="pill checklist-batch-hero-card__pill">
            <Icon name="checklist" />
            {summary.total} items
          </span>
          <span className={`pill checklist-batch-hero-card__pill ${summary.completionPercent > 0 ? 'pill--success' : ''}`}>
            <Icon name="clock" />
            {summary.completionPercent}% done
          </span>
        </div>

        <div className="checklist-batch-hero-card__progress">
          <article className="checklist-batch-hero-card__mini-stat">
            <span>Open</span>
            <strong>{summary.open}</strong>
          </article>
          <article className="checklist-batch-hero-card__mini-stat">
            <span>Progress</span>
            <strong>{summary.inProgress}</strong>
          </article>
          <article className="checklist-batch-hero-card__mini-stat">
            <span>Done</span>
            <strong>{summary.done}</strong>
          </article>
          <article className="checklist-batch-hero-card__mini-stat">
            <span>Blocked</span>
            <strong>{summary.blocked}</strong>
          </article>
        </div>
      </div>
    </section>
  )
}

function ChecklistBatchLeadBadge({
  batch,
  canManageBatch,
  isSavingBatchLead,
  isBatchLeadMenuOpen,
  onBatchLeadTrigger,
}: {
  batch: ChecklistBatch
  canManageBatch: boolean
  isSavingBatchLead: boolean
  isBatchLeadMenuOpen: boolean
  onBatchLeadTrigger: (event: ReactMouseEvent<HTMLButtonElement>) => void
}) {
  const qaLeadName = batch.qa_lead_name || 'Unassigned'
  const qaLeadInitials = batch.qa_lead_name ? initialsFromName(batch.qa_lead_name) : 'QA'
  const actionLabel = isSavingBatchLead ? 'Saving...' : qaLeadName

  if (canManageBatch) {
    return (
      <button
        type="button"
        className={`checklist-batch-hero-card__lead-compact ${isBatchLeadMenuOpen ? 'is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={isBatchLeadMenuOpen}
        aria-controls={isBatchLeadMenuOpen ? `checklist-batch-lead-menu-${batch.id}` : undefined}
        aria-label={`QA lead: ${qaLeadName}`}
        disabled={isSavingBatchLead}
        onClick={onBatchLeadTrigger}
      >
        <span className={`checklist-batch-hero-card__lead-avatar ${batch.qa_lead_name ? '' : 'is-empty'}`} aria-hidden="true">
          {qaLeadInitials}
        </span>
        <span className="checklist-batch-hero-card__lead-compact-copy">
          <span>QA Lead</span>
          <strong>{actionLabel}</strong>
        </span>
        <span className="checklist-batch-hero-card__lead-caret" aria-hidden="true">v</span>
      </button>
    )
  }

  return (
    <div className="checklist-batch-hero-card__lead-compact is-static" aria-label={`QA lead: ${qaLeadName}`}>
      <span className={`checklist-batch-hero-card__lead-avatar ${batch.qa_lead_name ? '' : 'is-empty'}`} aria-hidden="true">
        {qaLeadInitials}
      </span>
      <span className="checklist-batch-hero-card__lead-compact-copy">
        <span>QA Lead</span>
        <strong>{qaLeadName}</strong>
      </span>
    </div>
  )
}

export function ChecklistPage() {
  const { activeOrgId, activeScope, session } = useAuth()
  const [data, setData] = useState<ChecklistBatchesResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const run = async () => {
      if (!session?.accessToken || (activeScope === 'org' && !activeOrgId) || activeScope === 'none') {
        setData(null)
        return
      }
      try {
        const result = await fetchChecklistBatches(session.accessToken, activeScope === 'org' ? activeOrgId : null)
        setData(result)
        setError('')
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Unable to load checklist batches.'))
      }
    }
    void run()
  }, [activeOrgId, activeScope, session?.accessToken])

  if (!data && !error) {
    return <LoadingSection title="Checklist" subtitle="Batch tracking" />
  }

  return (
    <div className="page-stack">
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {canManageChecklist(session) ? (
        <SectionCard title="Manager Scope" subtitle="Owner, Project Manager, and QA Lead">
          <p className="body-copy">Checklist CRUD is backed by the legacy API and ready for deeper dynamic expansion.</p>
        </SectionCard>
      ) : null}
      {data ? (
        <SectionCard title="Checklist Batches" subtitle={`${data.batches.length} batch${data.batches.length === 1 ? '' : 'es'}`}>
          <div className="list-stack">
            {data.batches.map((batch) => (
              <ListRow
                key={batch.id}
                icon="checklist"
                title={batch.title}
                detail={`${batch.org_name || batch.project_name} | ${batch.project_name} | ${batch.module_name}${batch.submodule_name ? ` / ${batch.submodule_name}` : ''}`}
                meta={`${batch.status} | ${batch.total_items ?? 0} items`}
                action={(
                  <Link className="inline-link" to={`/app/checklist/batches/${batch.id}`}>
                    Open
                  </Link>
                )}
              />
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  )
}

export function ChecklistBatchDetailPage() {
  const { batchId } = useParams()
  const { activeOrgId, activeScope, getMembershipForOrg, session } = useAuth()
  const [data, setData] = useState<ChecklistBatchDetailResponse | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pendingAssignmentItemId, setPendingAssignmentItemId] = useState<number | null>(null)
  const [isSavingBatchLead, setIsSavingBatchLead] = useState(false)
  const [openAssignItemId, setOpenAssignItemId] = useState<number | null>(null)
  const [assignMenuAnchor, setAssignMenuAnchor] = useState<HTMLButtonElement | null>(null)
  const [isBatchLeadMenuOpen, setIsBatchLeadMenuOpen] = useState(false)
  const [batchLeadMenuAnchor, setBatchLeadMenuAnchor] = useState<HTMLButtonElement | null>(null)
  const [fallbackAssignableTesters, setFallbackAssignableTesters] = useState<ChecklistAssigneeOption[]>([])
  const [isLoadingFallbackAssignableTesters, setIsLoadingFallbackAssignableTesters] = useState(false)

  const numericBatchId = Number(batchId)
  const batchMembership = data ? getMembershipForOrg(data.batch.org_id) : null
  const canManageBatch = canManageChecklist(session, batchMembership)
  const activeAssignItem = data?.items.find((item) => item.id === openAssignItemId) ?? null
  const assignableTesters = useMemo(() => data?.assignable_testers ?? [], [data?.assignable_testers])
  const assignableQaLeads = useMemo(() => data?.assignable_qa_leads ?? [], [data?.assignable_qa_leads])
  const resolvedAssignableTesters = useMemo(
    () => (assignableTesters.length > 0 ? assignableTesters : fallbackAssignableTesters),
    [assignableTesters, fallbackAssignableTesters],
  )
  const shouldShowScreenshots = data?.batch.source_mode !== 'link'

  const itemAssignOptions = useMemo<SelectionMenuOption[]>(
    () => [
      { value: 0, label: 'Unassigned', description: 'Clear current assignee' },
      ...resolvedAssignableTesters.map((member) => ({
        value: member.user_id,
        label: member.username,
        description: member.role,
      })),
    ],
    [resolvedAssignableTesters],
  )

  const qaLeadOptions = useMemo<SelectionMenuOption[]>(
    () => [
      { value: 0, label: 'Unassigned', description: 'No QA lead owner yet' },
      ...assignableQaLeads.map((member) => ({
        value: member.user_id,
        label: member.username,
        description: member.role,
      })),
    ],
    [assignableQaLeads],
  )

  const closeItemAssignMenu = useCallback(() => {
    setOpenAssignItemId(null)
    setAssignMenuAnchor(null)
  }, [])

  const closeBatchLeadMenu = useCallback(() => {
    setIsBatchLeadMenuOpen(false)
    setBatchLeadMenuAnchor(null)
  }, [])

  const handleBatchLeadTrigger = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    setError('')
    setMessage('')
    closeItemAssignMenu()
    if (isBatchLeadMenuOpen) {
      closeBatchLeadMenu()
      return
    }
    setIsBatchLeadMenuOpen(true)
    setBatchLeadMenuAnchor(event.currentTarget)
  }, [closeBatchLeadMenu, closeItemAssignMenu, isBatchLeadMenuOpen])

  useEffect(() => {
    const run = async () => {
      if (!session?.accessToken || (activeScope === 'org' && !activeOrgId) || !numericBatchId) {
        setData(null)
        return
      }
      try {
        const result = await fetchChecklistBatch(session.accessToken, activeScope === 'org' ? activeOrgId : null, numericBatchId)
        setData(result)
        setError('')
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Unable to load checklist batch detail.'))
      }
    }
    void run()
  }, [activeOrgId, activeScope, numericBatchId, session?.accessToken])

  useEffect(() => {
    if (!canManageBatch) {
      closeItemAssignMenu()
      closeBatchLeadMenu()
    }
  }, [canManageBatch, closeBatchLeadMenu, closeItemAssignMenu])

  useEffect(() => {
    setFallbackAssignableTesters([])
    setIsLoadingFallbackAssignableTesters(false)
  }, [data?.batch.id])

  useEffect(() => {
    if (!canManageBatch || !activeAssignItem || !data || !session?.accessToken) {
      setIsLoadingFallbackAssignableTesters(false)
      return
    }

    if (assignableTesters.length > 0 || fallbackAssignableTesters.length > 0) {
      setIsLoadingFallbackAssignableTesters(false)
      return
    }

    let cancelled = false
    setIsLoadingFallbackAssignableTesters(true)

    void fetchChecklistItem(session.accessToken, data.batch.org_id, activeAssignItem.id)
      .then((result) => {
        if (cancelled) {
          return
        }
        setFallbackAssignableTesters(result.assignable_testers ?? [])
      })
      .catch((loadError) => {
        if (cancelled) {
          return
        }
        setError((current) => current || getErrorMessage(loadError, 'Unable to load QA Tester members.'))
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingFallbackAssignableTesters(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    activeAssignItem,
    assignableTesters.length,
    canManageBatch,
    data,
    fallbackAssignableTesters.length,
    session?.accessToken,
  ])

  const handleQuickAssign = useCallback(async (item: ChecklistItem, assignedToUserId: number) => {
    if (!session?.accessToken || !data) {
      return
    }

    if ((item.assigned_to_user_id ?? 0) === assignedToUserId) {
      closeItemAssignMenu()
      return
    }

    setPendingAssignmentItemId(item.id)
    setError('')
    setMessage('')

    try {
      const result = await updateChecklistItem(session.accessToken, data.batch.org_id, item.id, {
        assigned_to_user_id: assignedToUserId,
      })

      setData((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          items: current.items.map((entry) => (entry.id === item.id
            ? {
                ...entry,
                ...result.item,
                org_name: entry.org_name || current.batch.org_name || 'Organization',
              }
            : entry)),
        }
      })

      setMessage(
        assignedToUserId > 0
          ? `Assigned "${item.title}" to ${result.item.assigned_to_name || 'QA Tester'}.`
          : `Removed the assignee from "${item.title}".`,
      )
      closeItemAssignMenu()
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save checklist assignment.'))
    } finally {
      setPendingAssignmentItemId(null)
    }
  }, [closeItemAssignMenu, data, session?.accessToken])

  const handleBatchLeadSave = useCallback(async (qaLeadUserId: number) => {
    if (!session?.accessToken || !data) {
      return
    }

    if ((data.batch.assigned_qa_lead_id ?? 0) === qaLeadUserId) {
      closeBatchLeadMenu()
      return
    }

    setIsSavingBatchLead(true)
    setError('')
    setMessage('')

    try {
      const result = await updateChecklistBatch(session.accessToken, data.batch.org_id, data.batch.id, {
        project_id: data.batch.project_id,
        title: data.batch.title,
        module_name: data.batch.module_name,
        submodule_name: data.batch.submodule_name || '',
        status: data.batch.status,
        assigned_qa_lead_id: qaLeadUserId,
        notes: data.batch.notes || '',
        page_url: data.batch.page_url || '',
      })

      setData((current) => current
        ? {
            ...current,
            batch: {
              ...current.batch,
              ...result.batch,
              org_name: current.batch.org_name || 'Organization',
            },
          }
        : current)

      setMessage(
        qaLeadUserId > 0
          ? `Assigned "${data.batch.title}" to ${result.batch.qa_lead_name || 'QA Lead'}.`
          : `Removed the QA lead from "${data.batch.title}".`,
      )
      closeBatchLeadMenu()
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save batch QA lead.'))
    } finally {
      setIsSavingBatchLead(false)
    }
  }, [closeBatchLeadMenu, data, session?.accessToken])

  if (!numericBatchId) {
    return <EmptySection title="Checklist Detail" message="Batch id is invalid." />
  }

  if (!data && !error) {
    return <LoadingSection title="Checklist Detail" subtitle={`Batch #${numericBatchId}`} />
  }

  return (
    <div className="page-stack">
      {message ? <FormMessage tone="success" onDismiss={() => setMessage('')}>{message}</FormMessage> : null}
      {error ? <FormMessage tone="error" onDismiss={() => setError('')}>{error}</FormMessage> : null}

      {data ? (
        <>
          <BatchSummaryCard
            batch={data.batch}
            items={data.items}
            canManageBatch={canManageBatch}
            isSavingBatchLead={isSavingBatchLead}
            isBatchLeadMenuOpen={isBatchLeadMenuOpen}
            onBatchLeadTrigger={handleBatchLeadTrigger}
          />

          {shouldShowScreenshots ? (
            <SectionCard title="Screenshots" subtitle={`${data.attachments.length} file${data.attachments.length === 1 ? '' : 's'}`}>
              {data.attachments.length ? (
                <>
                  {data.attachments.filter(isImageAttachment).length ? (
                    <div className="checklist-batch-gallery">
                      {data.attachments.filter(isImageAttachment).map((attachment) => (
                        <a
                          key={attachment.id}
                          className="checklist-batch-gallery__item"
                          href={attachment.file_path || '#'}
                          target={attachment.file_path ? '_blank' : undefined}
                          rel={attachment.file_path ? 'noreferrer noopener' : undefined}
                        >
                          <img src={attachment.file_path} alt={attachment.original_name} loading="lazy" />
                          <span>{attachment.original_name}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {data.attachments.filter((attachment) => !isImageAttachment(attachment)).length ? (
                    <div className="checklist-attachment-list">
                      {data.attachments.filter((attachment) => !isImageAttachment(attachment)).map((attachment) => (
                        <a
                          key={attachment.id}
                          className="checklist-attachment"
                          href={attachment.file_path || '#'}
                          target={attachment.file_path ? '_blank' : undefined}
                          rel={attachment.file_path ? 'noreferrer noopener' : undefined}
                        >
                          <strong>{attachment.original_name}</strong>
                          <span>{attachment.uploaded_by_name || 'Unknown uploader'}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="body-copy">No AI-chat screenshots or batch attachments have been saved for this checklist batch yet.</p>
              )}
            </SectionCard>
          ) : null}

          <SectionCard title="Items">
            <div className="list-stack">
              {data.items.map((item) => {
                const isAssignMenuOpen = openAssignItemId === item.id
                const isUpdatingAssignment = pendingAssignmentItemId === item.id
                return (
                  <ListRow
                    key={item.id}
                    icon="checklist"
                    title={item.title}
                    detail={`${item.org_name || data.batch.org_name || 'Organization'} | ${item.required_role} | ${formatStatusLabel(item.status)}`}
                    meta={canManageBatch ? (
                      <button
                        type="button"
                        className={`checklist-assignee-trigger ${isAssignMenuOpen ? 'is-open' : ''}`}
                        aria-haspopup="menu"
                        aria-expanded={isAssignMenuOpen}
                        aria-controls={isAssignMenuOpen ? `checklist-item-assignee-menu-${item.id}` : undefined}
                        disabled={isUpdatingAssignment}
                        onClick={(event) => {
                          setError('')
                          setMessage('')
                          closeBatchLeadMenu()
                          if (isAssignMenuOpen) {
                            closeItemAssignMenu()
                            return
                          }
                          setOpenAssignItemId(item.id)
                          setAssignMenuAnchor(event.currentTarget)
                        }}
                      >
                        <span>{isUpdatingAssignment ? 'Saving...' : item.assigned_to_name || 'Unassigned'}</span>
                        <span className="checklist-assignee-trigger__caret" aria-hidden="true">v</span>
                      </button>
                    ) : (
                      item.assigned_to_name || 'Unassigned'
                    )}
                    action={(
                      <div className="list-row__actions">
                        <span className="pill">{item.priority}</span>
                        {item.issue_id ? (
                          <Link className="inline-link" to={`/app/reports/${item.issue_id}`}>
                            Linked Issue
                          </Link>
                        ) : null}
                        <Link className="inline-link" to={`/app/checklist/items/${item.id}`}>
                          Open
                        </Link>
                      </div>
                    )}
                  />
                )
              })}
            </div>
          </SectionCard>

          <ChecklistSelectionMenu
            open={Boolean(canManageBatch && activeAssignItem && assignMenuAnchor)}
            anchorElement={assignMenuAnchor}
            menuId={activeAssignItem ? `checklist-item-assignee-menu-${activeAssignItem.id}` : 'checklist-item-assignee-menu'}
            title="Assign QA Tester"
            subtitle={activeAssignItem?.title || data.batch.title}
            options={itemAssignOptions}
            selectedValue={activeAssignItem?.assigned_to_user_id ?? 0}
            pending={pendingAssignmentItemId !== null || isLoadingFallbackAssignableTesters}
            emptyMessage={isLoadingFallbackAssignableTesters
              ? 'Loading QA Tester members...'
              : 'No QA Tester members are available in this organization.'}
            onClose={closeItemAssignMenu}
            onSelect={(assignedToUserId) => {
              if (activeAssignItem) {
                void handleQuickAssign(activeAssignItem, assignedToUserId)
              }
            }}
          />

          <ChecklistSelectionMenu
            open={Boolean(canManageBatch && isBatchLeadMenuOpen && batchLeadMenuAnchor)}
            anchorElement={batchLeadMenuAnchor}
            menuId={`checklist-batch-lead-menu-${data.batch.id}`}
            title="Assign QA Lead"
            subtitle={data.batch.title}
            options={qaLeadOptions}
            selectedValue={data.batch.assigned_qa_lead_id ?? 0}
            pending={isSavingBatchLead}
            emptyMessage="No QA Lead members are available in this organization."
            onClose={closeBatchLeadMenu}
            onSelect={(qaLeadUserId) => {
              void handleBatchLeadSave(qaLeadUserId)
            }}
          />
        </>
      ) : null}
    </div>
  )
}
