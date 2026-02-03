import { call } from "frappe-ui"
import { clearHistoryCache } from "../components/cache/mindmapCommentHistoryCache"
import { generateUUID } from "@/utils/uuid"

function extractTextFromP(html) {
  if (!html) return ""

  const div = document.createElement("div")
  div.innerHTML = html

  const p = div.querySelector("p")
  return p?.textContent?.trim() || ""
}

export function useResolvedNode({
  activeNode,
  comments,
  entityName,
  activeSessionIndex,
}) {
  async function resolveNode() {
    const node = activeNode.value
    const session = activeSessionIndex.value
    const list = comments.value || []

    if (!node || session == null) return

    const filtered = list.filter(
      (c) =>
        String(c.node_id).trim() === String(node.id).trim() &&
        Number(c.session_index) === Number(session)
    )

    if (!filtered.length) return
    await call("drive.api.mindmap_comment.resolve_node", {
      entity_name: entityName,
      node_id: node.id,
      session_index: session,
      history: {
        node_key: node.node_key || generateUUID(),
        node_created_at: new Date(node.created_at).toISOString(),
        node_title: extractTextFromP(node.data?.label || ""),
        node_position: node.position,
        comments: filtered.map((c) => {
          let parsed = {}

          try {
            parsed =
              typeof c.comment === "string"
                ? JSON.parse(c.comment)
                : c.comment || {}
          } catch (e) {
            parsed = {}
          }

          return {
            id: c.name,
            owner: c.owner,
            created_at: c.creation,
            modified_at: c.modified,
            content: parsed.safe_html || "",
          }
        }),
      },
    })
    clearHistoryCache(entityName)
  }

  return { resolveNode }
}
