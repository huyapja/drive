import { TextSelection } from "@tiptap/pm/state"
import { splitListItem } from "@tiptap/pm/schema-list"
import { sinkListItem, liftListItem } from "@tiptap/pm/schema-list"
import { toast } from "@/utils/toasts"
import { generateUUID } from "@/utils/uuid"

function getCurrentListItem($from, schema) {
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type === schema.nodes.listItem) {
      return {
        node,
        depth: d,
        pos: $from.before(d),
      }
    }
  }
  return null
}

function findFirstBulletListAfterPos(doc, startPos, schema) {
  let pos = startPos

  while (pos < doc.content.size) {
    const node = doc.nodeAt(pos)
    if (!node) break

    // bỏ qua paragraph rỗng
    if (node.type === schema.nodes.paragraph && node.content.size === 0) {
      pos += node.nodeSize
      continue
    }

    if (node.type === schema.nodes.bulletList) {
      return { node, pos }
    }

    // gặp node khác → dừng
    break
  }

  return null
}

function isDeletingLastCharInListItem($from, schema) {
  if (!$from.parent?.isTextblock) return false

  const text = $from.parent.textContent

  const isEffectivelyEmpty =
    text === "" ||
    text === "\u200b"

  if (!isEffectivelyEmpty) return false

  // caret phải ở đầu
  if ($from.parentOffset !== 0) return false

  // phải nằm trong listItem
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type === schema.nodes.listItem) {
      return true
    }
  }

  return false
}


export function createEditorKeyDown({
  editor,
  flags,
  getEditingUserOfNode,
  getNodeIdFromSelection,
}) {
  function insertTempChildNode(editorInstance, newNodeId) {
    const { state, view } = editorInstance
    const { selection, schema } = state
    const { $from } = selection

    let found = null
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type === schema.nodes.listItem) {
        found = { node: $from.node(d), pos: $from.before(d) }
        break
      }
    }
    if (!found) return

    const insertPos = found.pos + found.node.nodeSize

    const inlineRootMark = schema.marks.inlineRoot.create()
    const text = schema.text("Nhánh mới", [inlineRootMark])

    const p = schema.nodes.paragraph.create({}, text)
    const li = schema.nodes.listItem.create(
      { nodeId: newNodeId, hasCount: false },
      p
    )

    let tr = state.tr.insert(insertPos, li)

    const caretPos = insertPos + 2 + text.nodeSize
    tr = tr.setSelection(TextSelection.create(tr.doc, caretPos))

    view.dispatch(tr)
    view.focus()
  }

  function emitCaretAfterKeyAction() {
    requestAnimationFrame(() => {
      const ed = editor.value
      if (!ed) return

      const { selection } = ed.state
      if (!selection || !selection.empty) return

      const nodeId = getNodeIdFromSelection(ed)
      if (!nodeId) return

      const editingUser = getEditingUserOfNode?.(nodeId)
      if (editingUser) return

      ed.options?.onCaretMove?.(nodeId)
    })
  }

  let lastBlockedNodeId = null
  let lastToastAt = 0

  return function handleKeyDown(view, event) {
    let shouldEmitCaret = false

    const CARET_KEYS = [
      "Enter",
      "Tab",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
    ]

    if (CARET_KEYS.includes(event.key)) {
      shouldEmitCaret = true
    }

    const { state } = view
    const { selection, schema } = state
    const { $from } = selection

    // ==============================
    // 🔒 REMOTE LOCK – BLOCK SỚM
    // ==============================
    let liDepth = null
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type === schema.nodes.listItem) {
        liDepth = d
        break
      }
    }

    if (liDepth) {
      const liNode = $from.node(liDepth)
      const nodeId = liNode?.attrs?.nodeId

      // reset khi sang node khác
      if (lastBlockedNodeId && lastBlockedNodeId !== nodeId) {
        lastBlockedNodeId = null
      }

      if (nodeId) {
        const editingUser = getEditingUserOfNode?.(nodeId)

        if (editingUser) {
          const now = Date.now()

          // ⚠️ FIX: Sử dụng cơ chế global throttle để tránh spam toast
          if (!window.__lastEditingToast) {
            window.__lastEditingToast = {}
          }
          const lastToast = window.__lastEditingToast[nodeId] || 0
          
          if (lastBlockedNodeId !== nodeId || now - lastToast > 2000) {
            lastBlockedNodeId = nodeId
            lastToastAt = now
            window.__lastEditingToast[nodeId] = now

            toast({
              title: `${editingUser.userName} đang chỉnh sửa node này`,
              text: "Vui lòng đợi họ hoàn thành",
              indicator: "orange",
              timeout: 3,
            })
          }

          const blocked =
            event.key.length === 1 ||
            event.key === "Enter" ||
            event.key === "Backspace" ||
            event.key === "Delete" ||
            event.key === "Tab"

          if (blocked) {
            event.preventDefault()
            event.stopPropagation()
            return true
          }
        }
      }
    }

    // ==============================
    // BLOCK BACKSPACE XOÁ NODE
    // ==============================
    if (event.key === "Backspace") {
      const { state } = view
      const { selection, schema } = state

      if (!(selection instanceof TextSelection)) return false
      if (!selection.empty) return false

      const { $from } = selection

      console.log(">>>>>>>>> i am here");
      

      if (isDeletingLastCharInListItem($from, schema)) {
        event.preventDefault()
        event.stopPropagation()

        // optional UX: rung nhẹ / toast
        // toast("Không thể xoá node rỗng", { indicator: "orange" })

        emitCaretAfterKeyAction()
        return true
      }
    }

    // ==============================
    // ADD CHILD NODE
    // ==============================
    if (event.key === "Enter") {
      const { state, dispatch } = view
      const { selection, schema } = state
      if (!selection.empty) return false

      const { $from } = selection
      // ==============================
      // CASE: ENTER TRONG HEADING
      // ==============================
      let headingDepth = null
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type === schema.nodes.heading) {
          headingDepth = d
          break
        }
      }

      if (headingDepth) {
        event.preventDefault()
        event.stopPropagation()

        const { state, view } = editor.value
        const { doc, schema } = state

        const headingEndPos = $from.after(headingDepth)

        // ==========================
        // CASE 1: ĐÃ CÓ LI → FOCUS LI ĐẦU
        // ==========================
        const found = findFirstBulletListAfterPos(doc, headingEndPos, schema)

        if (found && found.node.childCount > 0) {
          let tr = state.tr

          const ulPos = found.pos
          const firstLiPos = ulPos + 1 // vào <ul> → <li>

          const liNode = tr.doc.nodeAt(firstLiPos)
          if (!liNode) return true

          let tbNode = null
          let tbOffset = null

          liNode.forEach((child, offset) => {
            if (child.isTextblock && tbNode == null) {
              tbNode = child
              tbOffset = offset
            }
          })

          if (!tbNode) return true

          const textStartPos = firstLiPos + 1 + tbOffset + 1
          const caretPos = textStartPos + tbNode.content.size

          tr = tr
            .setSelection(TextSelection.create(tr.doc, caretPos))
            .setStoredMarks([])
            .setMeta("ui-only", true)

          view.dispatch(tr)
          view.focus()

          emitCaretAfterKeyAction()
          return true
        }

        // ==========================
        // CASE 2: CHƯA CÓ LI → TẠO ROOT CHILD ĐẦU
        // ==========================
        const newNodeId = generateUUID()
        flags.isCreatingDraftNode = true

        const inlineRootMark = schema.marks.inlineRoot.create({ clean: true })
        const text = schema.text("Nhánh mới", [inlineRootMark])
        const paragraph = schema.nodes.paragraph.create({}, text)

        const listItem = schema.nodes.listItem.create(
          { nodeId: newNodeId, hasCount: false },
          paragraph
        )

        const bulletList = schema.nodes.bulletList.create({}, listItem)

        let tr = state.tr.insert(headingEndPos, bulletList)

        const ulPos = headingEndPos
        const firstLiPos = ulPos + 1

        const liNode = tr.doc.nodeAt(firstLiPos)
        if (!liNode) return true

        let tbNode = null
        let tbOffset = null

        liNode.forEach((child, offset) => {
          if (child.isTextblock && tbNode == null) {
            tbNode = child
            tbOffset = offset
          }
        })

        if (!tbNode) return true

        const textStartPos = firstLiPos + 1 + tbOffset + 1
        const caretPos = textStartPos + tbNode.content.size

        tr = tr
          .setSelection(TextSelection.create(tr.doc, caretPos))
          .setStoredMarks([])
          .setMeta("ui-only", true)

        view.dispatch(tr)
        view.focus()

        editor.value?.options?.onAddChildNode?.({
          anchorNodeId: "root",
          newNodeId,
          position: "add_root_child",
        })

        requestAnimationFrame(() => {
          flags.isCreatingDraftNode = false
        })

        emitCaretAfterKeyAction()
        return true
      }

      // tìm listItem
      let liDepth = null
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type === schema.nodes.listItem) {
          liDepth = d
          break
        }
      }

      if (!liDepth) return false

      const liNode = $from.node(liDepth)
      const nodeId = liNode.attrs.nodeId
      if (!nodeId) return false

      const parentSize = $from.parent.content.size
      const offset = $from.parentOffset

      const isAtStart = offset === 0
      const isAtEnd = offset === parentSize
      const isInMiddle = offset > 0 && offset < parentSize

      // ==============================
      // CASE 1: CARET Ở CUỐI
      // - nếu có con → chui vào CON (đầu danh sách)
      // - nếu không → hành vi cũ
      // ==============================
      if (isAtEnd) {
        const newNodeId = generateUUID()
        flags.isCreatingDraftNode = true

        const current = getCurrentListItem($from, schema)
        if (!current) return false

        const parentNode = current.node
        const parentPos = current.pos

        const hasChildren = !!parentNode.attrs.hasChildren
        const isCollapsed = !!parentNode.attrs.collapsed

        if (hasChildren && !isCollapsed) {
          // =========================
          // CASE: có con + đang mở → thêm CON
          // =========================

          // 1. tìm bulletList con (KHÔNG GIẢ ĐỊNH child index)
          let bulletList = null
          let bulletListOffset = null

          parentNode.forEach((child, offset) => {
            if (child.type === schema.nodes.bulletList) {
              bulletList = child
              bulletListOffset = offset
            }
          })

          if (bulletList && bulletListOffset != null) {
            let tr = state.tr

            // 2. tạo paragraph + li chuẩn
            const inlineRootMark = schema.marks.inlineRoot.create()
            const text = schema.text("Nhánh mới", [inlineRootMark])
            const p = schema.nodes.paragraph.create({}, text)

            const li = schema.nodes.listItem.create(
              { nodeId: newNodeId, hasCount: false },
              p
            )

            // 3. vị trí thật của bulletList trong document
            const bulletListPos = parentPos + 1 + bulletListOffset

            // insert vào ĐẦU ul con
            tr = tr.insert(bulletListPos + 1, li)

            // 4. đặt caret vào paragraph của li mới
            const liStartPos = bulletListPos + 1
            const paragraphStartPos = liStartPos + 1
            const textStartPos = paragraphStartPos + 1

            const textLength = p.content.size
            const caretPos = textStartPos + textLength

            tr = tr
              .setSelection(TextSelection.create(tr.doc, caretPos))
              .setStoredMarks([])
              .setMeta("ui-only", true)

            dispatch(tr)

            editor.value?.options?.onAddChildNode?.({
              anchorNodeId: nodeId,
              newNodeId,
              position: "inside_child",
            })
          }
        } else {
          // =========================
          // CASE: không có con OR đang collapsed → thêm DƯỚI
          // =========================
          insertTempChildNode(editor.value, newNodeId)

          editor.value?.options?.onAddChildNode?.({
            anchorNodeId: nodeId,
            newNodeId,
            position: "after_carpet",
          })
        }

        requestAnimationFrame(() => {
          flags.isCreatingDraftNode = false
        })

        event.preventDefault()
        emitCaretAfterKeyAction()
        return true
      }

      // ==============================
      // CASE 2: CARET Ở ĐẦU → INSERT LI PHÍA TRÊN
      // ==============================
      if (isAtStart) {
        const { state, dispatch } = view
        const { schema } = state

        const newNodeId = generateUUID()
        flags.isCreatingDraftNode = true

        // vị trí insert listItem mới
        const liPos = $from.before(liDepth)

        // tạo inlineRoot mark ở trạng thái CLEAN
        // → KHÔNG inherit highlight / background
        const inlineRootMark = schema.marks.inlineRoot.create({ clean: true })

        // ext mặc định cho node mới
        const textNode = schema.text("Nhánh mới", [inlineRootMark])

        // paragraph
        const paragraph = schema.nodes.paragraph.create({}, textNode)

        //listItem mới (KHÔNG có highlight)
        const newListItem = schema.nodes.listItem.create(
          {
            nodeId: newNodeId,
            hasCount: false,
            highlight: null, // đảm bảo semantic highlight = null
          },
          paragraph
        )

        // nsert vào document
        let tr = state.tr.insert(liPos, newListItem)

        tr = tr.setStoredMarks([])

        dispatch(tr)

        //  báo intent cho mindmap layer
        editor.value?.options?.onAddChildNode?.({
          anchorNodeId: nodeId,
          newNodeId,
          position: "before_carpet",
        })

        // reset flag
        requestAnimationFrame(() => {
          flags.isCreatingDraftNode = false
        })

        event.preventDefault()
        emitCaretAfterKeyAction()
        return true
      }

      // ==============================
      // CASE 3: CARET Ở GIỮA → SPLIT (ID CŨ = AFTER)
      // ==============================
      if (isInMiddle) {
        const { state, view } = editor.value
        const { selection, schema } = state
        const { $from } = selection

        // 1️⃣ tìm listItem hiện tại
        let liDepth = null
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type === schema.nodes.listItem) {
            liDepth = d
            break
          }
        }
        if (!liDepth) return false

        const liNode = $from.node(liDepth)

        // 2️⃣ paragraph đầu tiên trong listItem
        const paragraph = liNode.child(0)
        if (!paragraph || !paragraph.isTextblock) return false

        // 3️⃣ lấy text CHÍNH XÁC của node hiện tại
        const fullText = paragraph.textContent || ""
        const cutPos = $from.parentOffset

        const beforeText = fullText.slice(0, cutPos).trim()
        const afterText = fullText.slice(cutPos).trim()

        // không split nếu 1 bên rỗng
        if (!beforeText || !afterText) return false

        // 4️⃣ tạo ID mới cho node BEFORE
        const newNodeId = generateUUID()
        flags.isCreatingDraftNode = true

        editor.value?.options?.onAddChildNode?.({
          position: "split_before",
          anchorNodeId: nodeId,
          newNodeId,
          label: `<p>${beforeText}</p>`,
        })

        // split
        splitListItem(schema.nodes.listItem)(state, view.dispatch)

        // state sau split
        const nextState = view.state
        const tr = nextState.tr

        let newLiPos = null
        let oldLiPos = null

        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type === schema.nodes.listItem) {
            newLiPos = $from.before(d)
            oldLiPos = $from.before(d) - $from.node(d).nodeSize
            break
          }
        }

        if (newLiPos == null || oldLiPos == null) return true

        const newLi = tr.doc.nodeAt(newLiPos)
        if (newLi) {
          const { hasCount, ...restAttrs } = newLi.attrs

          tr.setNodeMarkup(newLiPos, undefined, {
            ...restAttrs,
            nodeId: newNodeId,
          })
          // resolve lại position SAU KHI setNodeMarkup
          const $liPos = tr.doc.resolve(newLiPos)

          // tìm paragraph thật sự trong listItem
          let para = null
          let paraPos = null

          $liPos.node().forEach((child, offset) => {
            if (child.isTextblock && !para) {
              para = child
              paraPos = $liPos.start() + offset
            }
          })
        }

        view.dispatch(tr)

        requestAnimationFrame(() => {
          flags.isCreatingDraftNode = false
        })

        event.preventDefault()
        emitCaretAfterKeyAction()
        return true
      }
    }

    if (event.key === "Tab") {
      const { state, dispatch } = view
      const { schema, selection } = state
      const { $from } = selection

      // SHIFT + TAB → outdent
      if (event.shiftKey) {
        const lifted = liftListItem(schema.nodes.listItem)(state, dispatch)
        if (lifted) {
          event.preventDefault()
          return true
        }
        return false
      }

      // lấy listItem hiện tại
      const current = getCurrentListItem($from, schema)
      if (!current) return false

      const currentNodeId = current.node.attrs.nodeId
      if (!currentNodeId) return false

      // tìm node bên trên (node-1)
      const parentList = $from.node(current.depth - 1)
      const index = $from.index(current.depth - 1)

      if (index === 0) return false // không có node bên trên

      const prevLi = parentList.child(index - 1)
      const parentNodeId = prevLi?.attrs?.nodeId
      if (!parentNodeId) return false

      // đổi DOM (editor)
      const sunk = sinkListItem(schema.nodes.listItem)(state, dispatch)
      if (!sunk) return false

      // báo cho mindmap: MOVE node hiện tại vào node bên trên
      if (currentNodeId && parentNodeId && currentNodeId !== parentNodeId) {
        editor.value?.options?.onAddChildNode?.({
          nodeId: currentNodeId,
          anchorNodeId: parentNodeId,
          position: "tab_add_child",
        })
      }

      event.preventDefault()
      emitCaretAfterKeyAction()
      return true
    }

    // ==============================
    // CTRL / CMD + A → SELECT BLOCK
    // ==============================
    if ((event.ctrlKey || event.metaKey) && event.key === "a") {
      const { state, dispatch } = view
      const { selection } = state

      if (!selection.empty) return false

      const { $from } = selection

      let depth = $from.depth
      while (depth > 0 && !$from.node(depth).isBlock) {
        depth--
      }

      const blockNode = $from.node(depth)
      if (!blockNode) return false

      const start = $from.start(depth)
      const end = start + blockNode.nodeSize

      dispatch(
        state.tr.setSelection(
          state.selection.constructor.create(state.doc, start, end - 1)
        )
      )

      event.preventDefault()
      return true
    }

    if (event.key === "ArrowUp") {
      const { state } = view
      const { selection, schema, doc } = state

      if (!(selection instanceof TextSelection)) return false
      if (!selection.empty) return false

      const { $from } = selection
      if (!$from.parent?.isTextblock) return false

      // =============================
      // helpers
      // =============================
      function findLiDepth($pos) {
        for (let d = $pos.depth; d > 0; d--) {
          if ($pos.node(d).type === schema.nodes.listItem) return d
        }
        return null
      }

      function caretAtEndOfLi(liPos) {
        const $li = doc.resolve(liPos)
        const liNode = $li.nodeAfter
        if (!liNode) return null

        let textblock = null
        let offset = null

        liNode.forEach((child, off) => {
          if (!textblock && child.isTextblock) {
            textblock = child
            offset = off
          }
        })
        if (!textblock) return null

        const start = liPos + 1 + offset + 1
        return start + textblock.content.size
      }

      function lastDescendantLiPos(liPos) {
        let currentPos = liPos

        while (true) {
          const $li = doc.resolve(currentPos)
          const liNode = $li.nodeAfter
          if (!liNode) break

          if (!liNode.attrs?.hasChildren || liNode.attrs?.collapsed) break

          let ul = null
          let ulOffset = null

          liNode.forEach((child, off) => {
            if (!ul && child.type === schema.nodes.bulletList) {
              ul = child
              ulOffset = off
            }
          })

          if (!ul || ul.childCount === 0) break

          // ⬅️ POS CHUẨN của li con CUỐI
          currentPos = doc.resolve(currentPos + 1 + ulOffset + 1).pos

          // đi đến li cuối trong ul
          const ulNode = ul
          let lastIndex = ulNode.childCount - 1
          let offset = 0
          for (let i = 0; i < lastIndex; i++) {
            offset += ulNode.child(i).nodeSize
          }
          currentPos += offset
        }

        return currentPos
      }

      // =============================
      // 1️⃣ xác định listItem hiện tại
      // =============================
      const liDepth = findLiDepth($from)
      if (!liDepth) return false

      const liPos = $from.before(liDepth)
      const listDepth = liDepth - 1
      const index = $from.index(listDepth)

      // =============================
      // 2️⃣ CÓ sibling phía trên (FLAT hoặc CHILD)
      // =============================
      if (index > 0) {
        const parentList = $from.node(listDepth)
        const prevLi = parentList.child(index - 1)

        const prevLiPos = liPos - prevLi.nodeSize

        const targetLiPos = lastDescendantLiPos(prevLiPos)
        const caretPos = caretAtEndOfLi(targetLiPos)

        if (caretPos != null) {
          const tr = state.tr.setSelection(TextSelection.create(doc, caretPos))
          tr.setMeta("ui-only", true)
          view.dispatch(tr)
          emitCaretAfterKeyAction()
          event.preventDefault()
          return true
        }
      }

      // =============================
      // 3️⃣ KHÔNG có sibling → lên cha
      // =============================
      if (liDepth > 2) {
        const parentLiPos = $from.before(liDepth - 2)
        const caretPos = caretAtEndOfLi(parentLiPos)

        if (caretPos != null) {
          const tr = state.tr.setSelection(TextSelection.create(doc, caretPos))
          tr.setMeta("ui-only", true)
          view.dispatch(tr)
          emitCaretAfterKeyAction()
          event.preventDefault()
          return true
        }
      }

      return false
    }

    if (event.key === "ArrowDown") {
      const { state } = view
      const { selection, schema, doc } = state

      if (!(selection instanceof TextSelection)) return false
      if (!selection.empty) return false

      const { $from } = selection
      if (!$from.parent?.isTextblock) return false

      // =============================
      // helper: tìm listItem hiện tại
      // =============================
      function findLiDepth($pos) {
        for (let d = $pos.depth; d > 0; d--) {
          if ($pos.node(d).type === schema.nodes.listItem) return d
        }
        return null
      }

      // =============================
      // helper: caret CUỐI listItem (first textblock)
      // =============================
      function caretEndOfLi(liPos, docToUse) {
        const $li = docToUse.resolve(liPos)
        const liNode = $li.nodeAfter
        if (!liNode || liNode.type !== schema.nodes.listItem) return null

        // tìm textblock đầu tiên (thường là paragraph)
        let tbOffset = null
        let tbNode = null
        liNode.forEach((child, offset) => {
          if (!tbNode && child.isTextblock) {
            tbNode = child
            tbOffset = offset
          }
        })
        if (!tbNode) return null

        // pos vào trong textblock
        const textblockStart = liPos + 1 + tbOffset + 1

        // CUỐI nội dung textblock (đúng nghĩa “cuối”)
        // = start + content.size
        return textblockStart + tbNode.content.size
      }

      // =============================
      // helper: lấy liPos của “con đầu” nếu có children & mở
      // =============================
      function firstChildLiPos(liPos, docToUse) {
        const $li = docToUse.resolve(liPos)
        const liNode = $li.nodeAfter
        if (!liNode || liNode.type !== schema.nodes.listItem) return null

        const hasChildren = !!liNode.attrs?.hasChildren
        const isCollapsed = !!liNode.attrs?.collapsed
        if (!hasChildren || isCollapsed) return null

        // tìm bulletList con trong listItem
        let ulOffset = null
        let ulNode = null
        liNode.forEach((child, offset) => {
          if (!ulNode && child.type === schema.nodes.bulletList) {
            ulNode = child
            ulOffset = offset
          }
        })
        if (!ulNode || ulNode.childCount === 0) return null

        // vị trí bắt đầu của bulletList trong doc:
        // liPos + 1 (vào listItem) + ulOffset
        const ulPos = liPos + 1 + ulOffset

        // con đầu của bulletList nằm tại ulPos + 1
        return ulPos + 1
      }

      // =============================
      // helper: tìm sibling kế tiếp của listItem tại liDepth
      // =============================
      function nextSiblingLiPos($pos, liDepth) {
        const listDepth = liDepth - 1 // bulletList depth
        if (listDepth <= 0) return null

        const listNode = $pos.node(listDepth)
        const indexInList = $pos.index(listDepth)
        if (indexInList >= listNode.childCount - 1) return null

        // pos bắt đầu của current li
        const curLiPos = $pos.before(liDepth)

        // li kế tiếp bắt đầu ngay sau current li
        const curLiNode = $pos.node(liDepth)
        return curLiPos + curLiNode.nodeSize
      }

      // =============================
      // 1) xác định li hiện tại
      // =============================
      let liDepth = findLiDepth($from)
      if (!liDepth) return false

      // current liPos (pos bắt đầu node listItem hiện tại)
      let liPos = $from.before(liDepth)

      // =============================
      // 2) DFS: tìm next node theo thứ tự
      // =============================

      // (A) nếu li hiện tại có children & mở → vào con đầu
      const childLiPos = firstChildLiPos(liPos, doc)
      if (childLiPos != null) {
        const caretPos = caretEndOfLi(childLiPos, doc)
        if (caretPos != null) {
          const tr = state.tr.setSelection(TextSelection.create(doc, caretPos))
          tr.setMeta("ui-only", true)
          view.dispatch(tr)
          emitCaretAfterKeyAction()
          event.preventDefault()
          return true
        }
      }

      // (B) nếu có sibling kế tiếp cùng cấp → đi sibling
      const sibPos = nextSiblingLiPos($from, liDepth)
      if (sibPos != null) {
        const caretPos = caretEndOfLi(sibPos, doc)
        if (caretPos != null) {
          const tr = state.tr.setSelection(TextSelection.create(doc, caretPos))
          tr.setMeta("ui-only", true)
          view.dispatch(tr)
          emitCaretAfterKeyAction()
          event.preventDefault()
          return true
        }
      }

      // (C) không có sibling → climb lên cha để tìm sibling của cha
      // cứ mỗi lần climb: liDepth = liDepth - 2 (bỏ qua bulletList)
      let climbDepth = liDepth
      let $climb = $from

      while (climbDepth > 2) {
        const parentLiDepth = climbDepth - 2
        const parentLiPos = $climb.before(parentLiDepth)

        // resolve lại để tính sibling của parent
        const $parent = doc.resolve(parentLiPos + 1) // vào trong parent li để có index đúng
        const parentSibPos = nextSiblingLiPos($parent, parentLiDepth)

        if (parentSibPos != null) {
          const caretPos = caretEndOfLi(parentSibPos, doc)
          if (caretPos != null) {
            const tr = state.tr.setSelection(
              TextSelection.create(doc, caretPos)
            )
            tr.setMeta("ui-only", true)
            view.dispatch(tr)
            emitCaretAfterKeyAction()
            event.preventDefault()
            return true
          }
          return false
        }

        // climb tiếp lên nữa
        climbDepth = parentLiDepth
        $climb = $parent
      }
      return false
    }
    return false
  }
}
