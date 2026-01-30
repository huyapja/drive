// composables/useMindmapCommentInput.js
import { call } from "frappe-ui"
import { computed, ref, watch } from "vue"
import { generateUUID } from "@/utils/uuid"

/**
 * =========================
 * UTILS
 * =========================
 */

const STORAGE_KEY = "mindmap_comment_cache"

function loadAllCache() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
  } catch {
    return {}
  }
}

function saveAllCache(cache) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
}

function isEditorEmpty(html) {
  if (!html) return true

  const div = document.createElement("div")
  div.innerHTML = html

  // 1️⃣ có text thực
  const text = div.textContent?.replace(/\u00A0/g, "").trim()

  if (text) return false

  // 2️⃣ có ảnh trong imageRow
  const imageRow = div.querySelector('[data-type="image-row"]')
  if (imageRow && imageRow.querySelector("img")) {
    return false
  }

  return true
}

function parseGroupKey(groupKey) {
  if (!groupKey) return {}
  const [nodeId, sessionIndex] = groupKey.split("__")
  return { nodeId, sessionIndex: Number(sessionIndex) }
}

/**
 * =========================
 * COMPOSABLE
 * =========================
 */

export function useMindmapCommentInput({
  activeGroupKey,
  activeNode,
  entityName, // mindmap_id
  emit,
  previewImages,
  commentEditorRef,
  comments, // Optional: if provided, add comment to local state immediately
  pendingCommentIds, // Optional: Set to track comments being submitted to prevent duplicate from realtime
}) {
  const inputValue = ref("")

  /**
   * =========================
   * CACHE STRUCTURE
   *
   * {
   *   [mindmap_id]: {
   *     [groupKey]: html
   *   }
   * }
   * =========================
   */

  const allCache = ref(loadAllCache())

  // cache theo đúng mindmap hiện tại
  const commentCache = computed(() => {
    if (!entityName) return {}
    if (!allCache.value[entityName]) {
      allCache.value[entityName] = {}
    }
    return allCache.value[entityName]
  })

  watch(
    activeGroupKey,
    (key) => {
      if (!key) {
        inputValue.value = ""
        return
      }

      // ⬇️ load draft ĐÚNG group
      inputValue.value = commentCache.value[key] || ""
    },
    { immediate: true }
  )

  /**
   * =========================
   * SAVE DRAFT (AUTO)
   * =========================
   */
  watch(inputValue, (val) => {
    if (!entityName) return
    if (!activeGroupKey.value) return

    if (isEditorEmpty(val)) {
      delete commentCache.value[activeGroupKey.value]
    } else {
      commentCache.value[activeGroupKey.value] = val
    }

    saveAllCache(allCache.value)
  })

  /**
   * =========================
   * SUBMIT COMMENT
   * =========================
   */
  async function handleSubmit() {
    if (!entityName) return
    if (!activeGroupKey.value) return

    const finalHTML = inputValue.value
    if (isEditorEmpty(finalHTML)) return

    const { nodeId, sessionIndex } = parseGroupKey(activeGroupKey.value)
    if (!nodeId || !sessionIndex) return

    const node_key = activeNode?.value?.node_key || generateUUID()

    const payload = {
      text: finalHTML,
      created_at: new Date().toISOString(),
    }

    const res = await call("drive.api.mindmap_comment.add_comment", {
      mindmap_id: entityName,
      node_id: nodeId,
      session_index: sessionIndex,
      comment: JSON.stringify(payload),
      node_key,
    })

    // ✅ Add comment to local state immediately to prevent duplicate from realtime
    if (comments && res.comment) {
      const commentId = res.comment.name
      
      // Mark this comment as pending (being added from API response)
      // This will help realtime handler skip it if it arrives later
      if (pendingCommentIds && commentId) {
        pendingCommentIds.value.add(commentId)
      }
      
      const existed = comments.value.find((c) => c.name === commentId)
      if (!existed) {
        comments.value.push(res.comment)
      }
      
      // Remove from pending after a short delay to allow realtime to check
      if (pendingCommentIds && commentId) {
        setTimeout(() => {
          pendingCommentIds.value.delete(commentId)
        }, 1000)
      }
    }

    // ✅ clear draft đúng scope
    delete commentCache.value[activeGroupKey.value]
    saveAllCache(allCache.value)

    // reset UI
    inputValue.value = ""
    previewImages.value = []
    commentEditorRef.value?.[activeGroupKey.value]?.clearValues?.()

    emit("submit", res.comment)
  }

  /**
   * =========================
   * CANCEL
   * =========================
   */
  function handleCancel() {
    if (entityName && activeGroupKey.value) {
      delete commentCache.value[activeGroupKey.value]
      saveAllCache(allCache.value)
    }

    inputValue.value = ""
    previewImages.value = []

    emit("cancel")
  }

  /**
   * =========================
   * LOAD DRAFT
   * =========================
   */
  function loadDraft(groupKey) {
    if (!entityName) return
    inputValue.value = commentCache.value[groupKey] || ""
  }

  return {
    inputValue,
    handleSubmit,
    handleCancel,
    loadDraft,
  }
}
