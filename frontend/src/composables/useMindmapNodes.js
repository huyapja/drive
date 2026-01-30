import { computeInsertAfterAnchor, computeInsertAsLastChild } from '@/components/Mindmap/components/engine/nodeOrderEngine'
import { scrollToNode, scrollToNodeMinimal, scrollToNodeVertical } from '@/utils/d3mindmap/viewUtils'
import { toast } from '@/utils/toasts'
import { generateUUID } from '@/utils/uuid'
import { nextTick } from 'vue'

export function useMindmapNodes({
  nodes,
  edges,
  elements,
  selectedNode,
  changedNodeIds,
  nodeCreationOrder,
  d3Renderer,
  permissions,
  generateNodeId,
  saveSnapshot,
  scheduleSave,
  saveImmediately,
  updateD3RendererWithDelay
}) {
  let nodeFocusTimeouts = []
  let creationOrderCounter = 0

  const setCreationOrderCounter = (value) => {
    creationOrderCounter = value
  }

  const scrollToNodeWithRetry = (nodeId, maxRetries = 10, delay = 100) => {
    if (!d3Renderer.value || !nodeId) return
    
    let retries = 0
    
    const tryScroll = () => {
      if (d3Renderer.value.positions && d3Renderer.value.positions.has(nodeId)) {
        scrollToNode(d3Renderer.value, nodeId)
        return
      }
      
      retries++
      if (retries < maxRetries) {
        setTimeout(tryScroll, delay)
      } else {
        console.warn('Failed to scroll to node after retries:', nodeId)
      }
    }
    
    tryScroll()
  }

  const scrollToNodeMinimalWithRetry = (nodeId, maxRetries = 10, delay = 100) => {
    if (!d3Renderer.value || !nodeId) return
    
    let retries = 0
    
    const tryScroll = () => {
      if (d3Renderer.value.positions && d3Renderer.value.positions.has(nodeId)) {
        scrollToNodeMinimal(d3Renderer.value, nodeId, { margin: 80 })
        return
      }
      
      retries++
      if (retries < maxRetries) {
        setTimeout(tryScroll, delay)
      } else {
        console.warn('Failed to scroll to node after retries:', nodeId)
      }
    }
    
    tryScroll()
  }

  const scrollToNodeVerticalWithRetry = (nodeId, maxRetries = 10, delay = 100) => {
    if (!d3Renderer.value || !nodeId) return
    
    let retries = 0
    
    const tryScroll = () => {
      if (d3Renderer.value.positions && d3Renderer.value.positions.has(nodeId)) {
        scrollToNodeVertical(d3Renderer.value, nodeId, { margin: 80 })
        return
      }
      
      retries++
      if (retries < maxRetries) {
        setTimeout(tryScroll, delay)
      } else {
        console.warn('Failed to scroll to node after retries:', nodeId)
      }
    }
    
    tryScroll()
  }

  const addChildToNode = async (parentId) => {
    if (!permissions.value.write) {
      toast.error("Bạn không có quyền thêm node mới")
      return
    }
    
    nodeFocusTimeouts.forEach(timeoutId => clearTimeout(timeoutId))
    nodeFocusTimeouts = []

    const parent = nodes.value.find(n => n.id === parentId)
    if (!parent) return

    const newNodeId = generateNodeId()

    // ⚠️ FIX: Tính order để node mới ở dưới cùng so với các node con cùng cấp
    const newOrder = computeInsertAsLastChild({
      nodes: nodes.value,
      parentId: parentId,
      orderStore: nodeCreationOrder.value,
    })

    const newNode = {
      id: newNodeId,
      node_key: generateUUID(),
      created_at: Date.now(), 
      data: {
        label: 'Nhánh mới',
        parentId: parentId,
        order: newOrder
      }
    }

    const newEdge = {
      id: `edge-${parentId}-${newNodeId}`,
      source: parentId,
      target: newNodeId
    }

    nodeCreationOrder.value.set(newNodeId, newOrder)

    elements.value = [
      ...nodes.value,
      newNode,
      ...edges.value,
      newEdge
    ]

    console.log(`[AddChild] 💾 Gọi saveSnapshot() cho node ${newNodeId}`)
    saveSnapshot()

    changedNodeIds.value.add(newNodeId)

    selectedNode.value = newNode

    if (d3Renderer.value) {
      d3Renderer.value.selectedNode = newNodeId
      
      d3Renderer.value.nodeSizeCache.delete(newNodeId)
      
      if (!d3Renderer.value.newlyCreatedNodes) {
        d3Renderer.value.newlyCreatedNodes = new Map()
      }
      d3Renderer.value.newlyCreatedNodes.set(newNodeId, Date.now())
      // ⚠️ FIX: Tăng thời gian cleanup lên 5 giây để đảm bảo EditEnd có thể kiểm tra
      // Vì user có thể blur sau khi tạo node > 1 giây
      const cleanupTimeoutId = setTimeout(() => {
        if (d3Renderer.value.newlyCreatedNodes) {
          d3Renderer.value.newlyCreatedNodes.delete(newNodeId)
        }
      }, 5000) // Tăng từ 1s lên 5s
      nodeFocusTimeouts.push(cleanupTimeoutId)
    }

    await nextTick()

    void document.body.offsetHeight

    requestAnimationFrame(() => {
      void document.body.offsetHeight

      const timeoutId1 = setTimeout(() => {
        updateD3RendererWithDelay(100)

        if (d3Renderer.value) {
          const timeoutId2 = setTimeout(() => {
            d3Renderer.value.selectNode(newNodeId)
            
            scrollToNodeMinimalWithRetry(newNodeId, 15, 150)

            const timeoutId3 = setTimeout(() => {
              const nodeGroup = d3Renderer.value.g.select(`[data-node-id="${newNodeId}"]`)
              if (!nodeGroup.empty()) {
                const fo = nodeGroup.select('.node-text')
                const foNode = fo.node()

                if (foNode) {
                  const editorContainer = nodeGroup.select('.node-editor-container')
                  if (!editorContainer.empty()) {
                    editorContainer.style('pointer-events', 'auto')
                  }

                  const editorInstance = d3Renderer.value.getEditorInstance(newNodeId)
                  if (editorInstance) {
                    if (typeof window !== 'undefined' && window.__shouldClearFocusTimeouts) {
                      return
                    }
                    
                    editorInstance.commands.focus('end')
                    requestAnimationFrame(() => {
                      if (typeof window !== 'undefined' && window.__shouldClearFocusTimeouts) {
                        return
                      }
                      
                      d3Renderer.value.handleEditorFocus(newNodeId, foNode, newNode)
                      const timeoutId5 = setTimeout(() => {
                        
                      }, 50)
                      nodeFocusTimeouts.push(timeoutId5)
                    })
                  } else {
                    const timeoutId4 = setTimeout(() => {
                      if (typeof window !== 'undefined' && window.__shouldClearFocusTimeouts) {
                        return
                      }
                      
                      const editorInstance2 = d3Renderer.value.getEditorInstance(newNodeId)
                      if (editorInstance2) {
                        editorInstance2.commands.focus('end')
                        d3Renderer.value.handleEditorFocus(newNodeId, foNode, newNode)
                      }
                    }, 100)
                    nodeFocusTimeouts.push(timeoutId4)
                  }
                }
              }
            }, 200)
            nodeFocusTimeouts.push(timeoutId3)
          }, 150)
          nodeFocusTimeouts.push(timeoutId2)
        }
      }, 30)
      nodeFocusTimeouts.push(timeoutId1)
    })

    saveImmediately()
  }

  const addSiblingToNode = async (nodeId) => {
    if (!permissions.value.write) {
      toast.error("Bạn không có quyền thêm node mới")
      return
    }
    
    nodeFocusTimeouts.forEach(timeoutId => clearTimeout(timeoutId))
    nodeFocusTimeouts = []

    if (nodeId === 'root') return

    const parentEdge = edges.value.find(e => e.target === nodeId)

    if (!parentEdge) {
      return
    }

    const parentId = parentEdge.source

    const newNodeId = generateNodeId()

    const newNode = {
      id: newNodeId,
      node_key: generateUUID(),
      created_at: Date.now(), 
      data: {
        label: 'Nhánh mới',
        parentId: parentId
      }
    }
    
    const newEdge = {
      id: `edge-${parentId}-${newNodeId}`,
      source: parentId,
      target: newNodeId
    }

    // ⚠️ FIX: Tính order mới để node mới nằm ngay sau node hiện tại (không phải ở cuối)
    // Sử dụng computeInsertAfterAnchor để tính order chính xác
    const newOrder = computeInsertAfterAnchor({
      nodes: nodes.value,
      anchorNodeId: nodeId,
      parentId: parentId,
      orderStore: nodeCreationOrder.value
    })
    
    // Nếu không tính được order (node không có trong siblings), fallback về creationOrderCounter
    const finalOrder = newOrder !== null && newOrder !== undefined ? newOrder : creationOrderCounter++
    
    nodeCreationOrder.value.set(newNodeId, finalOrder)
    changedNodeIds.value.add(newNodeId)

    elements.value = [
      ...nodes.value,
      newNode,
      ...edges.value,
      newEdge
    ]

    console.log(`[AddSibling] 💾 Gọi saveSnapshot() cho node ${newNodeId}`)
    saveSnapshot()

    selectedNode.value = newNode

    if (d3Renderer.value) {
      d3Renderer.value.selectedNode = newNodeId
      
      d3Renderer.value.nodeSizeCache.delete(newNodeId)
      
      if (!d3Renderer.value.newlyCreatedNodes) {
        d3Renderer.value.newlyCreatedNodes = new Map()
      }
      d3Renderer.value.newlyCreatedNodes.set(newNodeId, Date.now())
      // ⚠️ FIX: Tăng thời gian cleanup lên 5 giây để đảm bảo EditEnd có thể kiểm tra
      // Vì user có thể blur sau khi tạo node > 1 giây
      const cleanupTimeoutId = setTimeout(() => {
        if (d3Renderer.value.newlyCreatedNodes) {
          d3Renderer.value.newlyCreatedNodes.delete(newNodeId)
        }
      }, 5000) // Tăng từ 1s lên 5s
      nodeFocusTimeouts.push(cleanupTimeoutId)
    }

    await nextTick()

    void document.body.offsetHeight

    requestAnimationFrame(() => {
      void document.body.offsetHeight

      const timeoutId1 = setTimeout(() => {
        updateD3RendererWithDelay(100)

        if (d3Renderer.value) {
          const timeoutId2 = setTimeout(() => {
            d3Renderer.value.selectNode(newNodeId)

            scrollToNodeMinimalWithRetry(newNodeId, 15, 150)

            const timeoutId3 = setTimeout(() => {
              const nodeGroup = d3Renderer.value.g.select(`[data-node-id="${newNodeId}"]`)
              if (!nodeGroup.empty()) {
                const fo = nodeGroup.select('.node-text')
                const foNode = fo.node()

                if (foNode) {
                  const editorContainer = nodeGroup.select('.node-editor-container')
                  if (!editorContainer.empty()) {
                    editorContainer.style('pointer-events', 'auto')
                  }

                  const editorInstance = d3Renderer.value.getEditorInstance(newNodeId)
                  if (editorInstance) {
                    if (typeof window !== 'undefined' && window.__shouldClearFocusTimeouts) {
                      return
                    }

                    editorInstance.commands.focus('end')
                    requestAnimationFrame(() => {
                      if (typeof window !== 'undefined' && window.__shouldClearFocusTimeouts) {
                        return
                      }
                      
                      d3Renderer.value.handleEditorFocus(newNodeId, foNode, newNode)
                      const timeoutId5 = setTimeout(() => {
                        
                      }, 50)
                      nodeFocusTimeouts.push(timeoutId5)
                    })
                  } else {
                    const timeoutId4 = setTimeout(() => {
                      if (typeof window !== 'undefined' && window.__shouldClearFocusTimeouts) {
                        return
                      }
                      
                      const editorInstance2 = d3Renderer.value.getEditorInstance(newNodeId)
                      if (editorInstance2) {
                        editorInstance2.commands.focus('end')
                        d3Renderer.value.handleEditorFocus(newNodeId, foNode, newNode)
                      }
                    }, 100)
                    nodeFocusTimeouts.push(timeoutId4)
                  }
                }
              }
            }, 200)
            nodeFocusTimeouts.push(timeoutId3)
          }, 150)
          nodeFocusTimeouts.push(timeoutId2)
        }
      }, 30)
      nodeFocusTimeouts.push(timeoutId1)
    })

    saveImmediately()
  }

  const countChildren = (nodeId) => {
    const visited = new Set()
    let count = 0

    const countDescendants = (id) => {
      if (visited.has(id)) return
      visited.add(id)

      const children = edges.value.filter(e => e.source === id)
      count += children.length

      children.forEach(edge => {
        countDescendants(edge.target)
      })
    }

    countDescendants(nodeId)
    return count
  }

  const getChildren = (nodeId) => {
    return edges.value
      .filter(edge => edge.source === nodeId)
      .map(edge => nodes.value.find(n => n.id === edge.target))
      .filter(Boolean)
  }

  const getParent = (nodeId) => {
    const edge = edges.value.find(edge => edge.target === nodeId)
    return edge ? nodes.value.find(n => n.id === edge.source) : null
  }

  const getNodeSize = (nodeId, node) => {
    let actualWidth = null
    let actualHeight = null

    if (d3Renderer.value) {
      if (node.data?.fixedWidth && node.data?.fixedHeight) {
        actualWidth = node.data.fixedWidth
        actualHeight = node.data.fixedHeight
      } else {
        const cachedSize = d3Renderer.value.nodeSizeCache?.get(nodeId)
        if (cachedSize) {
          actualWidth = cachedSize.width
          actualHeight = cachedSize.height
        } else {
          const nodeGroup = d3Renderer.value.g?.select(`[data-node-id="${nodeId}"]`)
          if (nodeGroup && !nodeGroup.empty()) {
            const rect = nodeGroup.select('.node-rect')
            const rectWidth = parseFloat(rect.attr('width'))
            const rectHeight = parseFloat(rect.attr('height'))
            if (rectWidth && rectHeight) {
              actualWidth = rectWidth
              actualHeight = rectHeight
            }
          }
        }
      }
    }

    return { width: actualWidth, height: actualHeight }
  }

  const copyNode = (nodeId) => {
    const node = nodes.value.find(n => n.id === nodeId)
    if (!node) return null

    const subtreeNodeIds = new Set([nodeId])
    const collectDescendants = (id) => {
      const childEdges = edges.value.filter(e => e.source === id)
      childEdges.forEach(edge => {
        const childId = edge.target
        subtreeNodeIds.add(childId)
        collectDescendants(childId)
      })
    }
    collectDescendants(nodeId)

    const subtreeNodes = nodes.value.filter(n => subtreeNodeIds.has(n.id))
    const subtreeEdges = edges.value.filter(e =>
      subtreeNodeIds.has(e.source) && subtreeNodeIds.has(e.target)
    )

    const nodeSizes = {}
    subtreeNodes.forEach(n => {
      const size = getNodeSize(n.id, n)
      nodeSizes[n.id] = size
    })

    return {
      type: 'nodes',
      rootId: nodeId,
      nodes: subtreeNodes,
      edges: subtreeEdges,
      nodeCreationOrder: new Map(nodeCreationOrder.value),
      nodeSizes: nodeSizes
    }
  }

  return {
    addChildToNode,
    addSiblingToNode,
    countChildren,
    getChildren,
    getParent,
    getNodeSize,
    copyNode,
    setCreationOrderCounter,
    scrollToNodeWithRetry,
    scrollToNodeVerticalWithRetry
  }
}

