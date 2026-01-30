import { nextTick } from 'vue'

/**
 * Mindmap Realtime Node Handlers
 * Xử lý các sự kiện realtime liên quan đến node operations
 */
export function useMindmapRealtimeNodes({
  store,
  nodes,
  edges,
  elements,
  selectedNode,
  editingNode,
  nodeEditingUsers,
  nodeCreationOrder,
  isSaving,
  entityName,
  d3Renderer,
  editingStartTime,
  changedNodeIds,
  calculateNodeHeightWithImages,
  saveSnapshot,
  applyStrikethroughToTitle
}) {
  
  /**
   * Helper function để render an toàn - chỉ render nếu không có node nào đang được edit
   * @param {Function} renderer - Renderer instance
   * @param {boolean} force - Force render ngay cả khi có node đang được edit
   * @returns {boolean} true nếu đã render, false nếu bỏ qua
   */
  const safeRender = (renderer, force = false) => {
    if (!renderer) return false
    
    const hasAnyNodeBeingEdited = !!editingNode.value
    
    if (hasAnyNodeBeingEdited && !force) {
      console.log('⚠️ Bỏ qua render vì có node đang được edit:', editingNode.value)
      return false
    }
    
    renderer.render()
    return true
  }

  // ⚠️ CRITICAL: Helper function để update renderer data mà KHÔNG gọi render()
  // Vì setData() tự động gọi render() và sẽ unmount editor
  const updateRendererDataWithoutRender = (renderer, nodes, edges, nodeCreationOrder) => {
    if (!renderer) return
    
    // Update data trực tiếp mà không gọi setData()
    renderer.nodes = nodes || renderer.nodes
    renderer.edges = edges || renderer.edges
    if (nodeCreationOrder) {
      renderer.options.nodeCreationOrder = nodeCreationOrder
    }
    
    console.log('⚠️ Đã update renderer data mà KHÔNG gọi setData/render để tránh unmount editor')
  }

  /**
   * Handle realtime nodes deleted
   */
  const handleRealtimeNodesDeleted = (payload) => {
    if (!payload) return
    
    if (payload.entity_name !== entityName) return
    
    const currentUser = store.state.user.id
    if (payload.modified_by === currentUser) {
      return
    }
    
    if (isSaving.value) {
      console.log('⏸️ Đang lưu, bỏ qua delete từ remote')
      return
    }
    
    console.log('📡 Nhận xóa nodes từ remote:', payload.node_ids)
    
    const nodeIdsToDelete = payload.node_ids || []
    if (!Array.isArray(nodeIdsToDelete) || nodeIdsToDelete.length === 0) {
      return
    }
    
    const editingNodeId = editingNode.value
    const selectedNodeId = selectedNode.value?.id
    
    if (nodeIdsToDelete.includes(editingNodeId) || nodeIdsToDelete.includes(selectedNodeId)) {
      selectedNode.value = null
      editingNode.value = null
    }
    
    const newNodes = nodes.value.filter(n => !nodeIdsToDelete.includes(n.id))
    const newEdges = edges.value.filter(e => 
      !nodeIdsToDelete.includes(e.source) && !nodeIdsToDelete.includes(e.target)
    )
    
    nodeIdsToDelete.forEach(nodeId => {
      nodeCreationOrder.value.delete(nodeId)
    })
    
    elements.value = [...newNodes, ...newEdges]
    
    // ⚠️ CRITICAL: Force lưu snapshot sau khi xóa nodes từ remote
    if (saveSnapshot && nodeIdsToDelete.length > 0) {
      console.log('💾 [Realtime] Force save snapshot sau khi nhận xóa nodes từ remote')
      nextTick(() => {
        saveSnapshot(true) // force = true
      })
    }
    
    const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer
    if (renderer) {
      const hasAnyNodeBeingEdited = !!editingNode.value
      
      if (hasAnyNodeBeingEdited) {
        // ⚠️ CRITICAL: KHÔNG gọi setData() khi có node đang được edit
        // Vì setData() tự động gọi render() và sẽ unmount editor
        updateRendererDataWithoutRender(renderer, newNodes, newEdges, nodeCreationOrder.value)
      } else {
        nextTick(() => {
          renderer.setData(newNodes, newEdges, nodeCreationOrder.value)
          safeRender(renderer)
        })
      }
    }
  }

  /**
   * Handle realtime node editing
   */
  const handleRealtimeNodeEditing = (payload) => {
    if (!payload) return
    
    if (payload.entity_name !== entityName) return
    
    const currentUser = store.state.user.id
    if (payload.user_id === currentUser) {
      return
    }
    
    console.log(`📝 User ${payload.user_name} ${payload.is_editing ? 'bắt đầu' : 'kết thúc'} edit node:`, payload.node_id)
    
    if (payload.is_editing) {
      nodeEditingUsers.value.set(payload.node_id, {
        userId: payload.user_id,
        userName: payload.user_name
      })
    } else {
      nodeEditingUsers.value.delete(payload.node_id)
    }
    
    const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer
    if (renderer) {
      const nodeGroup = renderer.g.select(`[data-node-id="${payload.node_id}"]`)
      if (!nodeGroup.empty()) {
        const rect = nodeGroup.select('.node-rect')
        if (!rect.empty()) {
          if (payload.is_editing) {
            rect
              .style('stroke', '#f59e0b')
              .style('stroke-width', '2px')
              .attr('stroke-dasharray', '4 2')
            
            const existingBadge = nodeGroup.select('.editing-badge')
            if (existingBadge.empty()) {
              const badge = nodeGroup.append('g')
                .attr('class', 'editing-badge')
                .attr('transform', 'translate(10, -15)')
              
              const text = badge.append('text')
                .attr('x', 0)
                .attr('y', 14)
                .style('fill', 'white')
                .style('font-size', '11px')
                .style('font-weight', 'bold')
                .text(`${payload.user_name}`)
              
              const textBBox = text.node().getBBox()
              const padding = 12
              const badgeWidth = textBBox.width + padding * 2
              
              badge.insert('rect', 'text')
                .attr('width', badgeWidth)
                .attr('height', 20)
                .attr('rx', 10)
                .style('fill', '#f59e0b')
              
              text
                .attr('x', badgeWidth / 2)
                .attr('text-anchor', 'middle')
            }
          } else {
            rect
              .style('stroke', null)
              .style('stroke-width', null)
              .attr('stroke-dasharray', null)
            
            nodeGroup.select('.editing-badge').remove()
          }
        }
      }
    }
  }

  /**
   * Handle realtime nodes batch update
   */
  const handleRealtimeNodesBatchUpdate = (payload) => {
    if (!payload) return
    
    if (payload.entity_name !== entityName) return
    
    const currentUser = store.state.user.id
    if (payload.modified_by === currentUser) {
      return
    }
    
    if (isSaving.value) {
      console.log('⏸️ Đang lưu, bỏ qua batch update từ remote')
      return
    }
    
    console.log('📡 Nhận batch update nodes từ remote:', payload.node_ids)
    
    const remoteNodeUpdates = payload.nodes || []
    if (!Array.isArray(remoteNodeUpdates) || remoteNodeUpdates.length === 0) {
      return
    }
    
    const editingNodeId = editingNode.value
    const selectedNodeId = selectedNode.value?.id
    
    const remoteNodeIds = remoteNodeUpdates.map(n => n.id)
    if (remoteNodeIds.includes(editingNodeId) || remoteNodeIds.includes(selectedNodeId)) {
      console.log('⚠️ Remote update liên quan đến node đang edit/select, bỏ qua')
      return
    }
    
    const localNodeIds = new Set(nodes.value.map(n => n.id))
    const hasNewNodes = remoteNodeUpdates.some(n => !localNodeIds.has(n.id))
    
    // ⚠️ CRITICAL: Update nodes đã tồn tại và thêm nodes mới
    const updatedNodes = nodes.value.map(localNode => {
      const remoteNode = remoteNodeUpdates.find(n => n.id === localNode.id)
      if (remoteNode) {
        if (remoteNode.data?.order !== undefined) {
          nodeCreationOrder.value.set(remoteNode.id, remoteNode.data.order)
        }
        return { ...localNode, ...remoteNode }
      }
      return localNode
    })
    
    // ⚠️ CRITICAL: Thêm các nodes mới (chưa có trong local)
    const newNodes = remoteNodeUpdates.filter(remoteNode => !localNodeIds.has(remoteNode.id))
    if (newNodes.length > 0) {
      console.log('➕ [Batch Update] Thêm nodes mới:', newNodes.map(n => n.id))
      newNodes.forEach(newNode => {
        if (newNode.data?.order !== undefined) {
          nodeCreationOrder.value.set(newNode.id, newNode.data.order)
        }
        updatedNodes.push(newNode)
      })
    }
    
    // ⚠️ CRITICAL: Xử lý edges nếu có trong payload
    let updatedEdges = edges.value
    if (payload.edges && Array.isArray(payload.edges)) {
      console.log('📡 Batch update có edges, xử lý edges:', payload.edges)
      
      // Lấy tất cả targets của edges mới
      const targetsToUpdate = new Set(payload.edges.map(e => e.target).filter(Boolean))
      
      // Xóa edges cũ có target trùng
      updatedEdges = edges.value.filter(e => !targetsToUpdate.has(e.target))
      
      // Thêm edges mới
      updatedEdges = [...updatedEdges, ...payload.edges]
    }
    
    // ⚠️ CRITICAL: Update elements.value với nodes và edges đã được cập nhật
    elements.value = [...updatedNodes, ...updatedEdges]
    console.log('✅ [Batch Update] Đã cập nhật elements.value:', {
      totalNodes: updatedNodes.length,
      totalEdges: updatedEdges.length,
      newNodesCount: newNodes.length
    })
    
    // ⚠️ CRITICAL: Force lưu snapshot nếu có node mới từ batch update
    if (saveSnapshot && hasNewNodes) {
      console.log('💾 [Realtime] Force save snapshot sau khi nhận batch update có node mới')
      nextTick(() => {
        saveSnapshot(true) // force = true
      })
    }
    
    const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer
    if (renderer) {
      nextTick(() => {
        remoteNodeUpdates.forEach(updatedNode => {
          renderer.nodeSizeCache.delete(updatedNode.id)
        })
        
        // ⚠️ CRITICAL: Nếu có edges update, clear positions cache để force recalculate layout
        if (payload.edges && Array.isArray(payload.edges) && payload.edges.length > 0) {
          console.log('🔄 Batch update có edges, clearing positions cache')
          if (renderer.positions) {
            payload.edges.forEach(edge => {
              renderer.positions.delete(edge.target)
              
              // Clear positions của subtree
              const clearChildrenPositions = (nodeId) => {
                const allEdges = elements.value.filter(el => el.source && el.target)
                const childEdges = allEdges.filter(e => e.source === nodeId)
                childEdges.forEach(childEdge => {
                  renderer.positions.delete(childEdge.target)
                  clearChildrenPositions(childEdge.target)
                })
              }
              clearChildrenPositions(edge.target)
            })
          }
        }
        
        // Lấy edges mới từ elements.value (đã được update ở trên)
        const currentEdges = elements.value.filter(el => el.source && el.target)
        
        // ⚠️ CRITICAL: Kiểm tra xem có node đang được edit không
        const hasAnyNodeBeingEdited = !!editingNode.value
        
        if (hasAnyNodeBeingEdited) {
          // ⚠️ CRITICAL: KHÔNG gọi setData() khi có node đang được edit
          // Vì setData() tự động gọi render() và sẽ unmount editor
          updateRendererDataWithoutRender(renderer, updatedNodes, currentEdges, nodeCreationOrder.value)
          
          // Update d3Node.data cho các nodes được update
          remoteNodeUpdates.forEach(updatedNode => {
            const d3Node = renderer.nodes.find(n => n.id === updatedNode.id)
            if (d3Node) {
              if (updatedNode.data?.label) {
                d3Node.data.label = updatedNode.data.label
              }
              if (updatedNode.data?.completed !== undefined) {
                d3Node.data.completed = updatedNode.data.completed
              }
              if (updatedNode.data?.rect) {
                d3Node.data.rect = updatedNode.data.rect
                d3Node.data.fixedWidth = updatedNode.data.rect.width
                d3Node.data.fixedHeight = updatedNode.data.rect.height
              }
            }
          })
        } else {
          renderer.setData(updatedNodes, currentEdges, nodeCreationOrder.value)
          safeRender(renderer)
        }
        
        // ⚠️ CRITICAL: Đợi render xong, sau đó mount editor cho các nodes mới
        if (newNodes.length > 0) {
          nextTick(() => {
            setTimeout(() => {
              newNodes.forEach(newNode => {
                const nodeGroup = renderer.g.select(`[data-node-id="${newNode.id}"]`)
                const editorContainer = nodeGroup.select('.node-editor-container')
                const containerNode = editorContainer.node()
                const containerHasChildren = containerNode && containerNode.children.length > 0
                
                if (!containerHasChildren && containerNode) {
                  console.log(`[Batch Update] ⚠️ Editor container rỗng cho node mới ${newNode.id}, mount editor`)
                  const text = newNode.data?.label || ''
                  const isRootNode = newNode.id === 'root' || newNode.data?.isRoot
                  const color = newNode.data?.color || '#1f2937'
                  
                  renderer.mountNodeEditor(newNode.id, containerNode, {
                    value: text,
                    placeholder: 'Nhập...',
                    color: color,
                    minHeight: '43px',
                    width: '100%',
                    height: 'auto',
                    isRoot: isRootNode,
                    uploadImage: renderer.uploadImage || null,
                    editable: renderer.options?.permissions?.write === 1,
                    onInput: (value) => {},
                    onFocus: () => {},
                    onBlur: () => {},
                  })
                  
                  // Đợi editor mount xong, sau đó set content
                  nextTick(() => {
                    setTimeout(() => {
                      const editorInstance = renderer.getEditorInstance(newNode.id)
                      if (editorInstance && !editorInstance.isDestroyed && editorInstance.view && text) {
                        try {
                          editorInstance.commands.setContent(text, false)
                          requestAnimationFrame(() => {
                            const tr = editorInstance.view.state.tr
                            editorInstance.view.dispatch(tr)
                            console.log(`[Batch Update] ✅ Đã mount và set content cho node mới ${newNode.id}`)
                          })
                        } catch (err) {
                          console.error(`[Batch Update] ❌ Lỗi khi set content cho node mới ${newNode.id}:`, err)
                        }
                      }
                    }, 100)
                  })
                }
              })
            }, 200)
          })
        }
      })
    }
  }

  const handleRealtimeNodeUpdate = (payload) => {
    const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer
    
      if (!payload) return
      
      if (payload.entity_name !== entityName) return
      
      const currentUser = store.state.user.id
      if (payload.modified_by === currentUser) {
        console.log('⏸️ Bỏ qua update từ chính mình')
        return
      }
      
      if (isSaving.value) {
        console.log('⏸️ Đang lưu, bỏ qua update từ remote')
        return
      }
      
      console.log('📡 Nhận update node từ remote:', payload.node_id, 'từ user:', payload.modified_by)
      
      const remoteNode = payload.node
      if (!remoteNode) {
        console.log('❌ Remote node không tồn tại')
        return
      }
      
      const editingNodeId = editingNode.value
      const selectedNodeId = selectedNode.value?.id
      
      console.log('🔍 Check editing state:', {
        remoteNodeId: remoteNode.id,
        editingNodeId,
        selectedNodeId,
        isLocalEditing: remoteNode.id === editingNodeId || remoteNode.id === selectedNodeId
      })
      
      const nodeIndex = nodes.value.findIndex(n => n.id === remoteNode.id)
      
      // ⚠️ FIX: Khai báo các biến trước khi sử dụng
      const isNodeBeingEdited = remoteNode.id === editingNodeId
      const isNodeSelected = remoteNode.id === selectedNodeId && remoteNode.id !== editingNodeId
      // ⚠️ CRITICAL FIX: Chỉ chặn update nếu node đang được CHÍNH USER ĐÓ edit
      // Không chặn chỉ vì node có trong changedNodeIds nếu node đó không phải là node đang được edit
      // Vì user có thể đã click vào nhiều node nhưng chỉ edit 1 node
      const hasLocalChanges = changedNodeIds.value.has(remoteNode.id) && isNodeBeingEdited
      
      // ⚠️ FIX: Kiểm tra xem có chỉ thay đổi completed status không
      const localNode = nodes.value.find(n => n.id === remoteNode.id)
      const isOnlyCompletedChange = localNode && 
        localNode.data?.label === remoteNode.data?.label &&
        localNode.data?.completed !== remoteNode.data?.completed
      
      // ⚠️ FIX: Luôn cho phép update completed status, ngay cả khi node đang được selected/focused
      // Vì completed không ảnh hưởng đến label đang được edit
      // ⚠️ CRITICAL: Chỉ chặn update nếu node đang được LOCAL USER edit/select
      // Nếu node khác (ví dụ: user A edit node 1, user B edit node 2), thì vẫn update bình thường
      const shouldUpdateElements = !isNodeBeingEdited && !isNodeSelected
      const shouldUpdateCompletedOnly = remoteNode.data?.completed !== undefined && 
        (isNodeBeingEdited || isNodeSelected)
      
      // ⚠️ CRITICAL: Phải update elements.value (không phải nodes.value vì nó là computed)
      const elementIndex = elements.value.findIndex(el => el.id === remoteNode.id && !el.source && !el.target)
      if (elementIndex !== -1) {
        if (shouldUpdateElements) {
          // ⚠️ FIX: Đảm bảo kích thước từ payload được giữ lại khi cập nhật elements.value
          const updatedNode = { ...remoteNode }
          if (remoteNode.data?.rect) {
            // Giữ nguyên kích thước từ payload
            if (!updatedNode.data) updatedNode.data = {}
            updatedNode.data.rect = remoteNode.data.rect
          }
          elements.value[elementIndex] = updatedNode
          console.log('✅ Đã cập nhật node vào elements.value:', remoteNode.id, {
            hasRect: !!remoteNode.data?.rect,
            rect: remoteNode.data?.rect
          })
        } else if (shouldUpdateCompletedOnly) {
          // ⚠️ FIX: Luôn update completed status, giữ nguyên label và các data khác
          // Nhưng vẫn cập nhật kích thước nếu có trong payload
          const updatedData = {
            ...elements.value[elementIndex].data,
            completed: remoteNode.data?.completed
          }
          if (remoteNode.data?.rect) {
            updatedData.rect = remoteNode.data.rect
          }
          elements.value[elementIndex] = {
            ...elements.value[elementIndex],
            data: updatedData
          }
          console.log('✅ Đã cập nhật completed status cho node đang được focus/edit:', remoteNode.id, {
            hasRect: !!remoteNode.data?.rect
          })
        } else {
          console.log('⏭️ Bỏ qua cập nhật elements.value vì node đang được local user edit:', {
            nodeId: remoteNode.id,
            isNodeBeingEdited,
            isNodeSelected,
            hasLocalChanges
          })
        }
      } else {
        elements.value.push({ ...remoteNode })
        console.log('✅ Đã thêm node mới vào elements.value:', remoteNode.id, {
          hasRect: !!remoteNode.data?.rect,
          rect: remoteNode.data?.rect
        })
      }
      
      if (remoteNode.data?.order !== undefined) {
        nodeCreationOrder.value.set(remoteNode.id, remoteNode.data.order)
      }
      
      // ⚠️ CRITICAL: Force lưu snapshot khi nhận node mới từ remote
      // Đảm bảo user có snapshot base để undo về
      if (saveSnapshot && elementIndex === -1) {
        console.log('💾 [Realtime] Force save snapshot sau khi nhận node mới:', remoteNode.id)
        // Dùng nextTick để đảm bảo computed nodes đã được update
        nextTick(() => {
          saveSnapshot(true) // force = true để bỏ qua check duplicate
        })
      }
      
      // ⚠️ FIX: Kiểm tra xem có node nào đang được local user edit không
      // Nếu có, không render để tránh blur editor đang được edit
      // (Các biến isNodeBeingEdited, isNodeSelected, hasLocalChanges đã được khai báo ở trên)
      
      // ⚠️ FIX: Nếu node đang được local user edit, chỉ update completed status nếu cần
      // Không render để tránh blur editor
      if (isNodeBeingEdited) {
        const timeSinceEditStart = editingStartTime.value ? Date.now() - editingStartTime.value : Infinity
        
        const shouldAllowUpdate = timeSinceEditStart < 2000 && !hasLocalChanges
        
        if (shouldAllowUpdate) {
          console.log('✨ Cho phép update editor vì vừa mới bắt đầu edit (<2s) và chưa có thay đổi')
        } else {
          console.log('⚠️ Node đang được LOCAL USER edit, chỉ update completed status, bỏ qua render để không gián đoạn user', {
            timeSinceEditStart,
            hasLocalChanges
          })
          
          // ⚠️ FIX: Chỉ update completed status và d3Node.data, không render
          if (renderer) {
            const d3Node = renderer.nodes.find(n => n.id === remoteNode.id)
            if (d3Node && remoteNode.data?.completed !== undefined) {
              const oldCompleted = d3Node.data?.completed || false
              d3Node.data.completed = remoteNode.data.completed
              
              // Apply strikethrough nếu completed status thay đổi
              if (oldCompleted !== remoteNode.data.completed && applyStrikethroughToTitle) {
                nextTick(() => {
                  setTimeout(() => {
                    const editorInstance = renderer.getEditorInstance?.(remoteNode.id)
                    if (editorInstance && !editorInstance.isDestroyed) {
                      if (!renderer.isUpdatingStyle) {
                        renderer.isUpdatingStyle = new Set()
                      }
                      renderer.isUpdatingStyle.add(remoteNode.id)
                      
                      applyStrikethroughToTitle(editorInstance, remoteNode.data.completed)
                      
                      setTimeout(() => {
                        if (renderer.isUpdatingStyle) {
                          renderer.isUpdatingStyle.delete(remoteNode.id)
                        }
                      }, 100)
                    }
                  }, 100)
                })
              }
            }
          }
          
          return // Không render để tránh blur editor
        }
      }
      
      // ⚠️ CRITICAL FIX: Chỉ bỏ qua render nếu CHÍNH node này đang được local user edit
      // KHÔNG bỏ qua render nếu node khác đang được edit (ví dụ: user A edit node 1, user B edit node 2)
      // Vì mỗi node độc lập, việc edit node này không nên chặn update node khác
      // Logic này đã được xử lý ở trên với isNodeBeingEdited, không cần check lại ở đây
      // Code sẽ tiếp tục render node này nếu nó không phải là node đang được edit
      
      if (payload.edge) {
        const remoteEdge = payload.edge
        // ⚠️ CRITICAL: Khi drag & drop, edge ID thay đổi (edge-oldParent-node → edge-newParent-node)
        // Phải xóa edge cũ theo target (1 node chỉ có 1 parent/edge đến nó)
        const target = remoteEdge.target
        
        // Xóa tất cả edges cũ có cùng target
        elements.value = elements.value.filter(el => {
          // Giữ lại elements không phải edge, hoặc edge không trỏ đến target này
          return !el.source || !el.target || el.target !== target
        })
        
        // Thêm edge mới
        elements.value.push({ ...remoteEdge })
        console.log('✅ Đã cập nhật edge:', remoteEdge.id)
      }
      
      if (renderer) {
        nextTick(() => {
          renderer.nodeSizeCache.delete(remoteNode.id)
          
          // ⚠️ CRITICAL: Nếu edge thay đổi (drag & drop), phải clear positions cache
          // để force recalculate layout với parent mới
          if (payload.edge) {
            console.log('🔄 Edge changed, clearing positions cache for node:', remoteNode.id)
            if (renderer.positions) {
              renderer.positions.delete(remoteNode.id)
              
              // Clear positions cache của tất cả node con (nếu có)
              const clearChildrenPositions = (nodeId) => {
                const allEdges = elements.value.filter(el => el.source && el.target)
                const childEdges = allEdges.filter(e => e.source === nodeId)
                childEdges.forEach(childEdge => {
                  renderer.positions.delete(childEdge.target)
                  clearChildrenPositions(childEdge.target)
                })
              }
              clearChildrenPositions(remoteNode.id)
            }
          }
          
            const d3Node = renderer.nodes.find(n => n.id === remoteNode.id)
            if (d3Node) {
              // ⚠️ FIX: Chỉ cập nhật label nếu node không đang được local user edit
              // Tránh overwrite label đang được edit với label bị corrupt từ remote
              const isLocalEditing = remoteNode.id === editingNodeId || remoteNode.id === selectedNodeId
              const hasLocalChanges = changedNodeIds.value.has(remoteNode.id)
              
              // ⚠️ FIX: Kiểm tra xem có chỉ thay đổi completed status không
              const localNode = nodes.value.find(n => n.id === remoteNode.id)
              const isOnlyCompletedChange = localNode && 
                localNode.data?.label === remoteNode.data?.label &&
                localNode.data?.completed !== remoteNode.data?.completed
              
              if (!isLocalEditing && !hasLocalChanges) {
                // ⚠️ DEBUG: Log để kiểm tra encoding
                const remoteLabel = remoteNode.data?.label || ''
                console.log('[Realtime] 📝 Cập nhật d3Node.data.label:', {
                  nodeId: remoteNode.id,
                  labelLength: remoteLabel.length,
                  labelPreview: remoteLabel.substring(0, 100),
                  labelFull: remoteLabel,
                  isLocalEditing,
                  hasLocalChanges
                })
                
                d3Node.data.label = remoteNode.data.label
              } else {
                console.log('[Realtime] ⏭️ Bỏ qua cập nhật label vì node đang được local user edit:', {
                  nodeId: remoteNode.id,
                  isLocalEditing,
                  hasLocalChanges
                })
              }
              
              // ⚠️ FIX: Cập nhật kích thước node từ payload nếu có
              if (remoteNode.data?.rect) {
                const remoteSize = remoteNode.data.rect
                if (remoteSize.width && remoteSize.height) {
                  console.log('[Realtime] 📐 Cập nhật kích thước node từ payload:', remoteNode.id, {
                    width: remoteSize.width,
                    height: remoteSize.height
                  })
                  
                  // Cập nhật cache
                  renderer.nodeSizeCache.set(remoteNode.id, { width: remoteSize.width, height: remoteSize.height })
                  
                  // Cập nhật d3Node.data.rect
                  if (!d3Node.data) d3Node.data = {}
                  d3Node.data.rect = { width: remoteSize.width, height: remoteSize.height }
                  d3Node.data.fixedWidth = remoteSize.width
                  d3Node.data.fixedHeight = remoteSize.height
                  
                  // ⚠️ CRITICAL: Cập nhật kích thước vào DOM ngay lập tức
                  nextTick(() => {
                    const nodeGroup = renderer.g.select(`[data-node-id="${remoteNode.id}"]`)
                    if (!nodeGroup.empty()) {
                      const rect = nodeGroup.select('.node-rect')
                      const fo = nodeGroup.select('.node-text')
                      
                      if (!rect.empty() && !fo.empty()) {
                        const borderOffset = 4
                        const foWidth = Math.max(0, remoteSize.width - borderOffset)
                        const foHeight = Math.max(0, remoteSize.height - borderOffset)
                        
                        rect.attr('width', remoteSize.width)
                        rect.attr('height', remoteSize.height)
                        rect.node()?.setAttribute('width', remoteSize.width)
                        rect.node()?.setAttribute('height', remoteSize.height)
                        
                        fo.attr('width', foWidth)
                        fo.attr('height', foHeight)
                        fo.node()?.setAttribute('width', foWidth)
                        fo.node()?.setAttribute('height', foHeight)
                        
                        nodeGroup.select('.add-child-btn').attr('cx', remoteSize.width + 20).attr('cy', remoteSize.height / 2)
                        nodeGroup.select('.add-child-text').attr('x', remoteSize.width + 20).attr('y', remoteSize.height / 2)
                        nodeGroup.select('.collapse-btn-number').attr('cx', remoteSize.width + 20).attr('cy', remoteSize.height / 2)
                        nodeGroup.select('.collapse-text-number').attr('x', remoteSize.width + 20).attr('y', remoteSize.height / 2)
                        nodeGroup.select('.collapse-btn-arrow').attr('cx', remoteSize.width + 20).attr('cy', remoteSize.height / 2)
                        nodeGroup.select('.collapse-arrow').attr('transform', `translate(${remoteSize.width + 20}, ${remoteSize.height / 2}) scale(0.7) translate(-12, -12)`)
                        nodeGroup.select('.collapse-button-bridge').attr('width', 20).attr('x', remoteSize.width).attr('height', remoteSize.height)
                        nodeGroup.select('.node-hover-layer').attr('width', remoteSize.width + 40).attr('height', remoteSize.height)
                        
                        console.log('[Realtime] ✅ Đã cập nhật kích thước vào DOM từ payload:', remoteNode.id, {
                          width: remoteSize.width,
                          height: remoteSize.height
                        })
                      }
                    }
                  })
                }
              }
            
            // ⚠️ FIX: Luôn cập nhật completed status, ngay cả khi node đang được edit
            // Vì completed không ảnh hưởng đến label đang được edit
            if (remoteNode.data?.completed !== undefined) {
              const oldCompleted = d3Node.data?.completed || false
              d3Node.data.completed = remoteNode.data.completed
              
              // ⚠️ FIX: Apply strikethrough nếu completed status thay đổi
              if (oldCompleted !== remoteNode.data.completed && applyStrikethroughToTitle) {
                nextTick(() => {
                  setTimeout(() => {
                    const editorInstance = renderer.getEditorInstance?.(remoteNode.id)
                    if (editorInstance && !editorInstance.isDestroyed) {
                      // ⚠️ FIX: Set flag để skip handleEditorInput khi apply strikethrough từ realtime
                      // Tránh trigger save và gây loop
                      if (!renderer.isUpdatingStyle) {
                        renderer.isUpdatingStyle = new Set()
                      }
                      renderer.isUpdatingStyle.add(remoteNode.id)
                      
                      applyStrikethroughToTitle(editorInstance, remoteNode.data.completed)
                      
                      // Clear flag sau khi dispatch
                      setTimeout(() => {
                        if (renderer.isUpdatingStyle) {
                          renderer.isUpdatingStyle.delete(remoteNode.id)
                        }
                      }, 100)
                    }
                  }, 100)
                })
              }
            }
            
            if (d3Node.data.fixedWidth || d3Node.data.fixedHeight) {
              delete d3Node.data.fixedWidth
              delete d3Node.data.fixedHeight
            }
          }
          
          // ⚠️ CRITICAL FIX: Chỉ bỏ qua render nếu CHÍNH node này đang được edit
          // KHÔNG bỏ qua render nếu node khác đang được edit
          // Vì mỗi node độc lập, việc edit node này không nên chặn render node khác
          const currentEditingNodeId = editingNode.value
          const isThisNodeBeingEdited = currentEditingNodeId === remoteNode.id
          
          if (isThisNodeBeingEdited) {
            console.log('⚠️ Node này đang được LOCAL USER edit, chỉ update data, KHÔNG gọi setData để tránh unmount editor:', remoteNode.id)
            
            // ⚠️ CRITICAL: KHÔNG gọi setData() vì nó sẽ trigger render() và unmount editor
            // Chỉ update d3Node.data trực tiếp
            if (elementIndex === -1) {
              // Node mới: thêm trực tiếp vào renderer.nodes mà không gọi setData()
              // Vì setData() sẽ trigger render() và unmount editor
              const newNode = { ...remoteNode }
              if (!renderer.nodes) {
                renderer.nodes = []
              }
              renderer.nodes.push(newNode)
              console.log('⚠️ Node mới được thêm trực tiếp vào renderer.nodes (không gọi setData) vì đang được edit:', remoteNode.id)
            } else {
              // Node đã tồn tại: chỉ update d3Node.data
              const d3Node = renderer.nodes.find(n => n.id === remoteNode.id)
              if (d3Node) {
                if (!isNodeSelected && !hasLocalChanges) {
                  d3Node.data.label = remoteNode.data.label
                }
                if (remoteNode.data?.completed !== undefined) {
                  d3Node.data.completed = remoteNode.data.completed
                }
                if (remoteNode.data?.rect) {
                  d3Node.data.rect = remoteNode.data.rect
                  d3Node.data.fixedWidth = remoteNode.data.rect.width
                  d3Node.data.fixedHeight = remoteNode.data.rect.height
                }
              }
            }
            
            return // Không render để tránh blur editor đang được edit
          }
          
          // ⚠️ CRITICAL FIX: Chỉ render nếu KHÔNG có node nào đang được edit
          // Vì render() sẽ re-render toàn bộ mindmap, làm unmount tất cả editor
          // Nếu có node đang được edit, chỉ update d3Node.data và set content thủ công
          const hasAnyNodeBeingEdited = !!editingNode.value
          
          if (hasAnyNodeBeingEdited) {
            console.log('⚠️ Có node đang được edit, chỉ update d3Node.data và set content thủ công, KHÔNG gọi setData để tránh unmount editor:', {
              editingNodeId: editingNode.value,
              updatingNodeId: remoteNode.id
            })
            
            // ⚠️ CRITICAL: Chỉ update d3Node.data trực tiếp, KHÔNG gọi setData()
            // Vì setData() có thể trigger re-render và unmount editor
            let d3Node = renderer.nodes.find(n => n.id === remoteNode.id)
            
            // Nếu node chưa tồn tại trong renderer.nodes, thêm vào trực tiếp
            if (!d3Node && elementIndex === -1) {
              if (!renderer.nodes) {
                renderer.nodes = []
              }
              d3Node = { ...remoteNode }
              renderer.nodes.push(d3Node)
              console.log('⚠️ Node mới được thêm trực tiếp vào renderer.nodes (không gọi setData) vì có node khác đang được edit:', remoteNode.id)
            }
            
            if (d3Node) {
              if (!isNodeBeingEdited && !isNodeSelected) {
                d3Node.data.label = remoteNode.data?.label || d3Node.data.label
              }
              if (remoteNode.data?.completed !== undefined) {
                d3Node.data.completed = remoteNode.data.completed
              }
              if (remoteNode.data?.rect) {
                d3Node.data.rect = remoteNode.data.rect
                d3Node.data.fixedWidth = remoteNode.data.rect.width
                d3Node.data.fixedHeight = remoteNode.data.rect.height
              }
            }
            
            // ⚠️ CRITICAL: KHÔNG gọi setData() khi có node đang được edit
            // Vì setData() có thể trigger re-render và unmount editor
            // Chỉ update d3Node.data trực tiếp và set content cho editor
            
            // Không gọi render() để tránh unmount editor
            // Chỉ set content cho editor của node này (sẽ được xử lý ở phần dưới)
            // ⚠️ CRITICAL: Vẫn cần đợi một chút để đảm bảo d3Node.data đã được update
            // trước khi set content cho editor
          } else {
            // Không có node nào đang được edit, có thể render an toàn
            renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
            safeRender(renderer)
          }
          
          // ⚠️ CRITICAL: Đợi render xong (nếu có render) hoặc đợi một chút (nếu không render)
          // để đảm bảo editor sẵn sàng trước khi set content
          // ⚠️ CRITICAL FIX: Luôn gọi set content, không phụ thuộc vào việc có render hay không
          // Vì editor đã được mount từ trước, chỉ cần set content mới
          // ⚠️ FIX: Giảm delay khi không render để set content nhanh hơn
          const delay = hasAnyNodeBeingEdited ? 50 : 200 // Nếu không render, chỉ đợi 50ms
          nextTick(() => {
            setTimeout(() => {
              // ⚠️ CRITICAL FIX: Chỉ bỏ qua set content nếu CHÍNH node này đang được edit VÀ có thay đổi local
              // KHÔNG bỏ qua nếu node khác đang được edit
              // Vì user có thể đã click vào node này trước đó nhưng đang edit node khác
              // ⚠️ QUAN TRỌNG: Luôn set content cho node không đang được edit để đảm bảo realtime sync
              if (isNodeBeingEdited) {
                const hasLocalChanges = changedNodeIds.value.has(remoteNode.id) && isNodeBeingEdited
                if (hasLocalChanges) {
                  console.log('⚠️ Node đang được edit và có thay đổi local, bỏ qua update editor content:', remoteNode.id)
                  return
                } else {
                  console.log('✨ Node đang được edit nhưng chưa có thay đổi, cho phép update editor content:', remoteNode.id)
                }
              } else {
                // Node không đang được edit, luôn cho phép update content
                // Đây là trường hợp quan trọng: user A edit node 1, user B edit node 2
                // Khi user A nhận update về node 2, node 2 không đang được edit → phải set content
                console.log('✨ [REALTIME] Node không đang được edit, sẽ set content để sync:', {
                  nodeId: remoteNode.id,
                  labelPreview: (remoteNode.data?.label || '').substring(0, 50),
                  editingNodeId: editingNode.value
                })
              }
              
              // ⚠️ CRITICAL: Đợi editor được mount trước khi set content
              // Đặc biệt quan trọng cho node mới được thêm từ realtime
              nextTick(() => {
                setTimeout(() => {
              // Kiểm tra xem editor đã được mount chưa
              const nodeGroup = renderer.g.select(`[data-node-id="${remoteNode.id}"]`)
              const editorContainer = nodeGroup.select('.node-editor-container')
              const containerNode = editorContainer.node()
              const containerHasChildren = containerNode && containerNode.children.length > 0
              
              // Nếu container rỗng, cần mount editor
              if (!containerHasChildren && containerNode) {
                console.log(`[Realtime] ⚠️ Editor container rỗng cho node ${remoteNode.id}, mount editor thủ công`)
                const nodeData = renderer.nodes.find(n => n.id === remoteNode.id)
                if (nodeData) {
                  const text = remoteNode.data?.label || nodeData.data?.label || ''
                  const isRootNode = nodeData.id === 'root' || nodeData.data?.isRoot
                  const color = nodeData.data?.color || '#1f2937'
                  
                  renderer.mountNodeEditor(remoteNode.id, containerNode, {
                    value: text,
                    placeholder: 'Nhập...',
                    color: color,
                    minHeight: '43px',
                    width: '100%',
                    height: 'auto',
                    isRoot: isRootNode,
                    uploadImage: renderer.uploadImage || null,
                    editable: renderer.options?.permissions?.write === 1,
                    onInput: (value) => {
                      // Handle input sẽ được set sau
                    },
                    onFocus: () => {
                      // Handle focus sẽ được set sau
                    },
                    onBlur: () => {
                      // Handle blur sẽ được set sau
                    },
                  })
                  
                  // ⚠️ CRITICAL: Đợi Vue component được mount và editor instance sẵn sàng
                  // mountNodeEditor mount ngay nhưng Vue component cần thời gian để render vào DOM
                  nextTick(() => {
                    setTimeout(() => {
                      // Function để set content sau khi đảm bảo container đã có children
                      const proceedWithSetContent = () => {
                        // Retry để đảm bảo editor instance sẵn sàng
                      const checkEditorReady = () => {
                        return new Promise((resolve) => {
                          let attempts = 0
                          const maxAttempts = 20
                          
                          const check = () => {
                            const editorInstance = renderer.getEditorInstance(remoteNode.id)
                            // ⚠️ CRITICAL: Kiểm tra cả container có children và editor instance có DOM
                            const containerCheck = renderer.g.select(`[data-node-id="${remoteNode.id}"]`)
                              .select('.node-editor-container')
                              .node()
                            const containerHasChildren = containerCheck && containerCheck.children.length > 0
                            
                            if (editorInstance && !editorInstance.isDestroyed && editorInstance.view && editorInstance.view.dom && containerHasChildren) {
                              resolve(editorInstance)
                            } else if (attempts < maxAttempts) {
                              attempts++
                              setTimeout(check, 50)
                            } else {
                              console.warn(`[Realtime] ⚠️ Editor không sẵn sàng sau ${maxAttempts} lần thử:`, {
                                hasEditorInstance: !!editorInstance,
                                hasView: !!editorInstance?.view,
                                hasDOM: !!editorInstance?.view?.dom,
                                containerHasChildren
                              })
                              resolve(null)
                            }
                          }
                          
                          check()
                        })
                      }
                      
                      checkEditorReady().then(editorInstance => {
                        if (editorInstance && !editorInstance.isDestroyed && editorInstance.view) {
                          try {
                            // ⚠️ CRITICAL: Đảm bảo label có giá trị trước khi set
                            let labelToSet = remoteNode.data?.label || ''
                            
                            // ⚠️ FIX: Normalize Unicode để tránh lỗi dấu tiếng Việt
                            if (labelToSet && typeof labelToSet === 'string') {
                              labelToSet = labelToSet.normalize('NFC')
                            }
                            
                            if (!labelToSet || labelToSet.trim() === '') {
                              console.warn(`[Realtime] ⚠️ Node ${remoteNode.id} không có label, bỏ qua set content`)
                              return
                            }
                            
                            // Kiểm tra xem DOM đã có chưa
                            const editorDOM = editorInstance.view.dom
                            const editorContent = editorDOM?.querySelector('.mindmap-editor-prose') || editorDOM
                            
                            if (!editorContent) {
                              console.warn(`[Realtime] ⚠️ Editor DOM chưa sẵn sàng cho node ${remoteNode.id}`)
                              return
                            }
                            
                            // ⚠️ FIX: Đếm số lượng ảnh trong content mới để đảm bảo tất cả ảnh được set
                            const imageCountInNewContent = (labelToSet.match(/<img[^>]*>/gi) || []).length
                            
                            editorInstance.commands.setContent(labelToSet, false)
                            
                            // ⚠️ CRITICAL: Force update editor view để đảm bảo DOM được cập nhật
                            requestAnimationFrame(() => {
                              const tr = editorInstance.view.state.tr
                              editorInstance.view.dispatch(tr)
                              
                              // Kiểm tra lại DOM sau khi dispatch
                              nextTick(() => {
                                const updatedContent = editorInstance.view.dom?.querySelector('.mindmap-editor-prose') || editorInstance.view.dom
                                const hasContent = updatedContent && (updatedContent.textContent || updatedContent.innerHTML.trim() !== '<p></p>')
                                
                                // ⚠️ FIX: Kiểm tra số lượng ảnh thực tế trong DOM
                                const actualImageCount = updatedContent?.querySelectorAll('img').length || 0
                                
                                // Kiểm tra lại container
                                const finalContainerCheck = renderer.g.select(`[data-node-id="${remoteNode.id}"]`)
                                  .select('.node-editor-container')
                                  .node()
                                const finalContainerHasChildren = finalContainerCheck && finalContainerCheck.children.length > 0
                                
                                console.log(`[Realtime] ✅ Đã mount và set content cho node ${remoteNode.id}:`, {
                                  labelLength: labelToSet.length,
                                  labelPreview: labelToSet.substring(0, 100),
                                  hasView: !!editorInstance.view,
                                  hasDOM: !!editorInstance.view?.dom,
                                  hasContent: hasContent,
                                  containerHasChildren: finalContainerHasChildren,
                                  imageCountInContent: imageCountInNewContent,
                                  actualImageCount: actualImageCount,
                                  domContent: updatedContent?.textContent || updatedContent?.innerHTML?.substring(0, 100) || 'empty'
                                })
                                
                                // ⚠️ FIX: Nếu số lượng ảnh không khớp, tiếp tục kiểm tra và retry
                                // if (actualImageCount !== imageCountInNewContent && imageCountInNewContent > 0) {
                                //   let retryCheckAttempts = 0
                                //   const maxRetryCheckAttempts = 20 // 20 * 100ms = 2 giây
                                //   let retryCount = 0
                                //   const maxRetries = 2
                                //   let isRetryCompleted = false
                                  
                                //   const retryCheckImages = () => {
                                //     if (isRetryCompleted) return
                                    
                                //     retryCheckAttempts++
                                //     const retryEditorContent = editorInstance.view?.dom?.querySelector('.mindmap-editor-prose') || editorInstance.view?.dom
                                //     const retryImageCount = retryEditorContent?.querySelectorAll('img').length || 0
                                    
                                //     // Nếu số lượng ảnh khớp, dừng kiểm tra ngay
                                //     if (retryImageCount === imageCountInNewContent) {
                                //       isRetryCompleted = true
                                //       return
                                //     }
                                    
                                //     // Nếu số lượng ảnh không khớp và chưa retry quá nhiều lần
                                //     if (retryImageCount !== imageCountInNewContent && retryCount < maxRetries && retryCheckAttempts % 5 === 0) {
                                //       retryCount++
                                //       editorInstance.commands.setContent(labelToSet, false)
                                //       requestAnimationFrame(() => {
                                //         const tr2 = editorInstance.view.state.tr
                                //         editorInstance.view.dispatch(tr2)
                                //       })
                                //     }
                                    
                                //     // Tiếp tục kiểm tra nếu chưa đạt max attempts và chưa hoàn thành
                                //     if (retryCheckAttempts < maxRetryCheckAttempts && !isRetryCompleted) {
                                //       setTimeout(retryCheckImages, 100)
                                //     }
                                //   }
                                  
                                //   // Bắt đầu retry check sau 300ms
                                //   setTimeout(retryCheckImages, 300)
                                // }
                                
                                // Nếu container vẫn rỗng, trigger render lại (chỉ khi không có node đang được edit)
                                if (!finalContainerHasChildren) {
                                  console.warn(`[Realtime] ⚠️ Container vẫn rỗng sau khi set content, thử render lại`)
                                  if (!safeRender(renderer)) {
                                    console.warn(`[Realtime] ⚠️ Không thể render vì có node đang được edit, sẽ retry sau`)
                                  }
                                }
                              })
                            })
                          } catch (err) {
                            console.error(`[Realtime] ❌ Lỗi khi set content cho node ${remoteNode.id}:`, err)
                          }
                        } else {
                          console.warn(`[Realtime] ⚠️ Editor instance không sẵn sàng cho node ${remoteNode.id} sau 20 lần thử`)
                        }
                      })
                      }
                      
                      // Kiểm tra xem Vue component đã được mount chưa
                      const vueAppEntry = renderer.vueApps?.get(remoteNode.id)
                      if (!vueAppEntry) {
                        console.warn(`[Realtime] ⚠️ Vue app chưa được mount cho node ${remoteNode.id}`)
                        return
                      }
                      
                      // Kiểm tra xem container có children chưa (Vue component đã mount vào DOM)
                      const currentContainerNode = renderer.g.select(`[data-node-id="${remoteNode.id}"]`)
                        .select('.node-editor-container')
                        .node()
                      const currentHasChildren = currentContainerNode && currentContainerNode.children.length > 0
                      
                      if (!currentHasChildren) {
                        console.warn(`[Realtime] ⚠️ Container vẫn rỗng sau khi mount, kiểm tra lại sau render`)
                        setTimeout(() => {
                          const finalContainerNode = renderer.g.select(`[data-node-id="${remoteNode.id}"]`)
                            .select('.node-editor-container')
                            .node()
                          const finalHasChildren = finalContainerNode && finalContainerNode.children.length > 0
                          
                          if (!finalHasChildren) {
                            console.error(`[Realtime] ❌ Container vẫn rỗng sau khi render cho node ${remoteNode.id}, thử mount lại`)
                            if (finalContainerNode) {
                              renderer.mountNodeEditor(remoteNode.id, finalContainerNode, {
                                value: text,
                                placeholder: 'Nhập...',
                                color: color,
                                minHeight: '43px',
                                width: '100%',
                                height: 'auto',
                                isRoot: isRootNode,
                                uploadImage: renderer.uploadImage || null,
                                editable: renderer.options?.permissions?.write === 1,
                                onInput: (value) => {},
                                onFocus: () => {},
                                onBlur: () => {},
                              })
                              
                              nextTick(() => {
                                setTimeout(() => {
                                  const retryContainerNode = renderer.g.select(`[data-node-id="${remoteNode.id}"]`)
                                    .select('.node-editor-container')
                                    .node()
                                  const retryHasChildren = retryContainerNode && retryContainerNode.children.length > 0
                                  if (!retryHasChildren) {
                                    console.error(`[Realtime] ❌ Container vẫn rỗng sau khi mount lại cho node ${remoteNode.id}`)
                                    return
                                  }
                                  proceedWithSetContent()
                                }, 100)
                              })
                            } else {
                              return
                            }
                          } else {
                            proceedWithSetContent()
                          }
                        }, 150)
                      } else {
                        proceedWithSetContent()
                      }
                    }, 200)
                  })
                }
              } else {
                // Editor đã được mount, chỉ cần set content
                // ⚠️ CRITICAL: Đợi editor instance sẵn sàng
                const checkAndSetContent = async () => {
                  let editorInstance = renderer.getEditorInstance(remoteNode.id)
                  let attempts = 0
                  const maxAttempts = 5
                  
                  while ((!editorInstance || editorInstance.isDestroyed || !editorInstance.view) && attempts < maxAttempts) {
                    await nextTick()
                    editorInstance = renderer.getEditorInstance(remoteNode.id)
                    attempts++
                    if (attempts < maxAttempts) {
                      await new Promise(resolve => setTimeout(resolve, 50))
                    }
                  }
                  
                  return editorInstance
                }
                
                checkAndSetContent().then(editorInstance => {
                  if (!editorInstance) {
                    console.warn(`[Realtime] ⚠️ Không thể lấy editor instance cho node ${remoteNode.id} sau ${maxAttempts} lần thử`)
                    return
                  }
                  
                  if (editorInstance.isDestroyed) {
                    console.warn(`[Realtime] ⚠️ Editor instance đã bị destroy cho node ${remoteNode.id}`)
                    return
                  }
                  
                  if (!editorInstance.view) {
                    console.warn(`[Realtime] ⚠️ Editor instance chưa có view cho node ${remoteNode.id}`)
                    return
                  }
                  
                  if (editorInstance && !editorInstance.isDestroyed && editorInstance.view) {
                    try {
                      // ⚠️ CRITICAL: Đảm bảo label có giá trị trước khi set
                      // Ưu tiên dùng label từ remoteNode, sau đó từ d3Node.data
                      let labelToSet = remoteNode.data?.label || ''
                      if (!labelToSet) {
                        const d3Node = renderer.nodes.find(n => n.id === remoteNode.id)
                        labelToSet = d3Node?.data?.label || ''
                      }
                      
                      // ⚠️ FIX: Normalize Unicode để tránh lỗi dấu tiếng Việt
                      if (labelToSet && typeof labelToSet === 'string') {
                        labelToSet = labelToSet.normalize('NFC')
                      }
                      
                      if (!labelToSet || labelToSet.trim() === '') {
                        console.warn(`[Realtime] ⚠️ Node ${remoteNode.id} không có label, bỏ qua set content`)
                        return
                      }
                      
                      // ⚠️ FIX: Kiểm tra content hiện tại để tránh set lại nếu giống nhau
                      const currentContent = editorInstance.getHTML()
                      if (currentContent === labelToSet) {
                        console.log(`[Realtime] ⏭️ Content không thay đổi, bỏ qua set content cho node ${remoteNode.id}`)
                        return
                      }
                      
                      console.log(`[Realtime] 📝 Sẽ set content cho node ${remoteNode.id}:`, {
                        labelLength: labelToSet.length,
                        labelPreview: labelToSet.substring(0, 100),
                        currentContentLength: currentContent.length,
                        isNodeBeingEdited,
                        editingNodeId: editingNode.value
                      })
                      
                      // ⚠️ FIX: Đếm số lượng ảnh trong content mới
                      const imageCountInNewContent = (labelToSet.match(/<img[^>]*>/gi) || []).length
                      
                      // ⚠️ FIX: Nếu có nhiều ảnh (>2), parse HTML và extract ảnh để TipTap parse đúng
                      // TipTap có thể không parse đúng HTML có nhiều image-wrapper
                      if (imageCountInNewContent > 2) {
                        const tempDiv = document.createElement('div')
                        tempDiv.innerHTML = labelToSet
                        
                        // Extract text content (paragraphs)
                        const paragraphs = Array.from(tempDiv.querySelectorAll('p'))
                        const textContent = paragraphs.map(p => p.outerHTML).join('')
                        
                        // Extract tất cả ảnh (cả trong image-wrapper và img trần)
                        const imageWrappers = Array.from(tempDiv.querySelectorAll('.image-wrapper'))
                        const rawImages = Array.from(tempDiv.querySelectorAll('img:not(.image-wrapper img)'))
                        
                        // Build content mới: text + images (chỉ img tags, không có image-wrapper)
                        let newContent = textContent
                        
                        imageWrappers.forEach(wrapper => {
                          const img = wrapper.querySelector('img')
                          if (img) {
                            const imgSrc = img.getAttribute('src') || ''
                            const imgAlt = img.getAttribute('alt') || ''
                            newContent += `<img src="${imgSrc}" alt="${imgAlt}" />`
                          }
                        })
                        
                        rawImages.forEach(img => {
                          const imgSrc = img.getAttribute('src') || ''
                          const imgAlt = img.getAttribute('alt') || ''
                          if (imgSrc && !imageWrappers.some(w => w.querySelector(`img[src="${imgSrc}"]`))) {
                            newContent += `<img src="${imgSrc}" alt="${imgAlt}" />`
                          }
                        })
                        
                        // Thêm blockquote nếu có
                        const blockquote = tempDiv.querySelector('blockquote')
                        if (blockquote) {
                          newContent += blockquote.outerHTML
                        }
                        
                        // Set content mới (TipTap sẽ tự động wrap ảnh bằng ImageWithWrapper extension)
                        editorInstance.commands.setContent(newContent, false)
                        console.log(`[Realtime] ✅ Đã set content (nhiều ảnh) cho node ${remoteNode.id}`)
                      } else {
                        editorInstance.commands.setContent(labelToSet, false)
                        console.log(`[Realtime] ✅ Đã set content cho node ${remoteNode.id}`)
                      }
                      
                      // ⚠️ CRITICAL: Force update editor view để đảm bảo DOM được cập nhật
                      if (editorInstance.view) {
                        requestAnimationFrame(() => {
                          const tr = editorInstance.view.state.tr
                          editorInstance.view.dispatch(tr)
                          
                          // ⚠️ CRITICAL: Verify content đã được set đúng
                          nextTick(() => {
                            const updatedContent = editorInstance.getHTML()
                            const contentMatches = updatedContent === labelToSet || updatedContent === newContent
                            console.log(`[Realtime] 🔍 Verify content sau khi set cho node ${remoteNode.id}:`, {
                              contentMatches,
                              expectedLength: labelToSet.length,
                              actualLength: updatedContent.length,
                              preview: updatedContent.substring(0, 100)
                            })
                          })
                          
                          // // ⚠️ FIX: Chỉ kiểm tra và retry nếu có ảnh
                          // if (imageCountInNewContent > 0) {
                          //   nextTick(() => {
                          //     let checkAttempts = 0
                          //     const maxCheckAttempts = 20 // 20 * 100ms = 2 giây
                          //     let retryCount = 0
                          //     const maxRetries = 2
                          //     let isCompleted = false
                              
                          //     const checkImages = () => {
                          //       if (isCompleted) return
                                
                          //       checkAttempts++
                          //       const editorDOM = editorInstance.view?.dom
                          //       if (editorDOM) {
                          //         const editorContent = editorDOM.querySelector('.mindmap-editor-prose') || editorDOM
                          //         const actualImageCount = editorContent.querySelectorAll('img').length
                                  
                          //         // Nếu số lượng ảnh khớp, dừng kiểm tra ngay
                          //         if (actualImageCount === imageCountInNewContent) {
                          //           isCompleted = true
                          //           return
                          //         }
                                  
                          //         // Nếu số lượng ảnh không khớp và chưa retry quá nhiều lần
                          //         if (actualImageCount !== imageCountInNewContent && retryCount < maxRetries && checkAttempts % 5 === 0) {
                          //           retryCount++
                          //           editorInstance.commands.setContent(labelToSet, false)
                          //           requestAnimationFrame(() => {
                          //             const tr2 = editorInstance.view.state.tr
                          //             editorInstance.view.dispatch(tr2)
                          //           })
                          //         }
                                  
                          //         // Tiếp tục kiểm tra nếu chưa đạt max attempts và chưa hoàn thành
                          //         if (checkAttempts < maxCheckAttempts && !isCompleted) {
                          //           setTimeout(checkImages, 100)
                          //         }
                          //       } else if (checkAttempts < maxCheckAttempts && !isCompleted) {
                          //         setTimeout(checkImages, 100)
                          //       }
                          //     }
                              
                          //     // Bắt đầu kiểm tra sau 200ms
                          //     setTimeout(checkImages, 200)
                          //   })
                          // }
                        })
                      }
                      
                      console.log(`[Realtime] ✅ Đã set content cho node ${remoteNode.id} (editor đã mount):`, {
                        labelLength: labelToSet.length,
                        labelPreview: labelToSet.substring(0, 100),
                        hasView: !!editorInstance.view,
                        hasDOM: !!editorInstance.view?.dom,
                        imageCount: imageCountInNewContent
                      })
                      
                      // ⚠️ FIX: Sau khi set content thành công, trigger tính toán lại kích thước ngay
                      // Đảm bảo kích thước node được cập nhật đúng sau khi nhận real-time update
                      // ⚠️ CRITICAL: Chỉ tính toán lại kích thước nếu node này KHÔNG đang được edit
                      if (editingNode.value !== remoteNode.id) {
                        nextTick(() => {
                          setTimeout(() => {
                            calculateAndUpdateNodeSize(remoteNode.id)
                          }, 150)
                        })
                      } else {
                        console.log(`[Realtime] ⚠️ Bỏ qua tính toán lại kích thước cho node ${remoteNode.id} vì node này đang được edit`)
                      }
                    } catch (err) {
                      console.error(`[Realtime] ❌ Lỗi khi set content cho node ${remoteNode.id}:`, err)
                    }
                  } else {
                    console.warn(`[Realtime] ⚠️ Editor instance không sẵn sàng cho node ${remoteNode.id} sau 5 lần thử`)
                  }
                })
              }
                }, 100)
              })
            }, 100)
          })
          
          // ⚠️ FIX: Helper function để tính toán lại kích thước và cập nhật
          const calculateAndUpdateNodeSize = (nodeId) => {
            // ⚠️ CRITICAL: Không tính toán lại kích thước nếu node này đang được edit
            if (editingNode.value === nodeId) {
              console.log(`[Realtime] ⚠️ Bỏ qua tính toán lại kích thước cho node ${nodeId} vì node này đang được edit`)
              return
            }
            
            const editorInstance = renderer.getEditorInstance(nodeId)
            if (!editorInstance || editorInstance.isDestroyed) {
              console.warn(`[Realtime] ⚠️ Editor instance không sẵn sàng cho node ${nodeId} khi tính toán size`)
              return
            }
            
            const remoteNode = nodes.value.find(n => n.id === nodeId)
            if (!remoteNode || !remoteNode.data?.label || remoteNode.data.label.trim() === '') {
              console.warn(`[Realtime] ⚠️ Node ${nodeId} không có label, bỏ qua tính toán size`)
              return
            }
            
            // ⚠️ FIX: Nếu đã có kích thước từ payload, sử dụng luôn không cần tính toán lại
            if (remoteNode.data?.rect && remoteNode.data.rect.width && remoteNode.data.rect.height) {
              const sizeFromPayload = remoteNode.data.rect
              console.log(`[Realtime] ✅ Sử dụng kích thước từ payload cho node ${nodeId}:`, {
                width: sizeFromPayload.width,
                height: sizeFromPayload.height
              })
              
              requestAnimationFrame(() => {
                const nodeGroup = renderer.g.select(`[data-node-id="${nodeId}"]`)
                if (!nodeGroup.empty()) {
                  const rect = nodeGroup.select('.node-rect')
                  const fo = nodeGroup.select('.node-text')
                  const editorDOM = editorInstance.view?.dom
                  const editorContent = editorDOM?.querySelector('.mindmap-editor-prose') || editorDOM
                  
                  if (!rect.empty() && !fo.empty() && editorContent) {
                    updateNodeSizeWithNewSize(nodeId, sizeFromPayload, rect, fo, nodeGroup, editorContent, 4)
                  }
                }
              })
              return
            }
            
            console.log(`[Realtime] 🔄 Bắt đầu tính toán lại kích thước cho node ${nodeId} (không có kích thước từ payload)`)
            
            requestAnimationFrame(() => {
              setTimeout(() => {
                requestAnimationFrame(() => {
                  const nodeGroup = renderer.g.select(`[data-node-id="${nodeId}"]`)
                  if (nodeGroup.empty()) {
                    console.warn(`[Realtime] ⚠️ Không tìm thấy node group cho node ${nodeId}`)
                    return
                  }
                  
                  const rect = nodeGroup.select('.node-rect')
                  const fo = nodeGroup.select('.node-text')
                  
                  if (rect.empty() || fo.empty()) {
                    console.warn(`[Realtime] ⚠️ Không tìm thấy rect hoặc fo cho node ${nodeId}`)
                    return
                  }
                  
                  const editorDOM = editorInstance.view?.dom
                  const editorContent = editorDOM?.querySelector('.mindmap-editor-prose') || editorDOM
                  
                  if (!editorContent) {
                    console.warn(`[Realtime] ⚠️ Không tìm thấy editor content cho node ${nodeId}`)
                    return
                  }
                  
                  const borderOffset = 4
                  const maxWidth = 400
                  const minWidth = 130
                  const singleLineHeight = Math.ceil(19 * 1.4) + 16
                  
                  const hasImages = remoteNode.data?.label?.includes('<img') || remoteNode.data?.label?.includes('image-wrapper')
                  
                  if (hasImages) {
                    const newSize = { width: maxWidth, height: singleLineHeight }
                    updateNodeSizeWithNewSize(nodeId, newSize, rect, fo, nodeGroup, editorContent, borderOffset)
                  } else {
                    // ⚠️ FIX: Đo trực tiếp từ DOM element sau khi content đã được set
                    // Đảm bảo kích thước chính xác hơn estimateNodeSize
                    const editorHTML = editorInstance.getHTML() || ''
                    const editorContentText = editorContent.textContent || editorContent.innerText || ''
                    
                    // Đo width thực tế từ DOM
                    void editorContent.offsetWidth
                    void editorContent.offsetHeight
                    void editorContent.scrollWidth
                    void editorContent.scrollHeight
                    
                    // ⚠️ FIX: Đo trực tiếp từ DOM sau khi content đã được set
                    // Đợi một chút để DOM được cập nhật và đo lại
                    setTimeout(() => {
                      // Đảm bảo editorContent có width đúng để đo chính xác
                      // Tạm thời set width auto và white-space nowrap để đo scrollWidth chính xác
                      const originalWidth = editorContent.style.width
                      const originalWhiteSpace = editorContent.style.whiteSpace
                      
                      editorContent.style.setProperty('width', 'auto', 'important')
                      editorContent.style.setProperty('white-space', 'nowrap', 'important')
                      editorContent.style.setProperty('box-sizing', 'border-box', 'important')
                      
                      requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                          // Đo scrollWidth sau khi đã set white-space: nowrap
                          const actualScrollWidth = editorContent.scrollWidth || editorContent.offsetWidth || 0
                          const actualScrollHeight = editorContent.scrollHeight || editorContent.offsetHeight || 0
                          
                          // Tính width: scrollWidth + padding (16px mỗi bên = 32px) + border (4px)
                          const calculatedWidth = Math.max(actualScrollWidth + 32, minWidth)
                          const calculatedHeight = Math.max(actualScrollHeight, singleLineHeight)
                          
                          // Nếu width quá lớn, dùng maxWidth
                          const finalWidth = calculatedWidth > maxWidth ? maxWidth : calculatedWidth
                          
                          const newSize = { width: finalWidth, height: calculatedHeight }
                          
                          console.log(`[Realtime] 📐 Đo kích thước từ DOM cho node ${nodeId}:`, {
                            editorHTML: editorHTML.substring(0, 100),
                            editorContentText: editorContentText.substring(0, 50),
                            actualScrollWidth,
                            actualScrollHeight,
                            calculatedWidth: finalWidth,
                            calculatedHeight,
                            newSize
                          })
                          
                          // Restore original styles
                          if (originalWidth) {
                            editorContent.style.setProperty('width', originalWidth, 'important')
                          }
                          if (originalWhiteSpace) {
                            editorContent.style.setProperty('white-space', originalWhiteSpace, 'important')
                          }
                          
                          // Cập nhật kích thước
                          updateNodeSizeWithNewSize(nodeId, newSize, rect, fo, nodeGroup, editorContent, borderOffset)
                        })
                      })
                    }, 150)
                  }
                })
              }, 10)
            })
          }
          
          // ⚠️ FIX: Helper function để cập nhật kích thước node
          const updateNodeSizeWithNewSize = (nodeId, newSize, rect, fo, nodeGroup, editorContent, borderOffset) => {
            // ⚠️ CRITICAL: Không cập nhật kích thước nếu node này đang được edit
            if (editingNode.value === nodeId) {
              console.log(`[Realtime] ⚠️ Bỏ qua cập nhật kích thước cho node ${nodeId} vì node này đang được edit`)
              return
            }
            
            // ⚠️ CRITICAL: Cập nhật kích thước vào DOM và cache
            renderer.nodeSizeCache.set(nodeId, newSize)
            
            const node = renderer.nodes.find((n) => n.id === nodeId)
            if (node && !node.data) node.data = {}
            if (node) {
              node.data.rect = { width: newSize.width, height: newSize.height }
            }
            
            rect.attr('width', newSize.width)
            rect.attr('height', newSize.height)
            rect.node()?.setAttribute('width', newSize.width)
            rect.node()?.setAttribute('height', newSize.height)
            
            const foWidth = Math.max(0, newSize.width - borderOffset)
            const foHeight = Math.max(0, newSize.height - borderOffset)
            fo.attr('width', foWidth)
            fo.attr('height', foHeight)
            fo.node()?.setAttribute('width', foWidth)
            fo.node()?.setAttribute('height', foHeight)
            
            editorContent.style.setProperty('width', `${foWidth}px`, 'important')
            
            nodeGroup.select('.add-child-btn').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
            nodeGroup.select('.add-child-text').attr('x', newSize.width + 20).attr('y', newSize.height / 2)
            nodeGroup.select('.collapse-btn-number').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
            nodeGroup.select('.collapse-text-number').attr('x', newSize.width + 20).attr('y', newSize.height / 2)
            nodeGroup.select('.collapse-btn-arrow').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
            nodeGroup.select('.collapse-arrow').attr('transform', `translate(${newSize.width + 20}, ${newSize.height / 2}) scale(0.7) translate(-12, -12)`)
            nodeGroup.select('.collapse-button-bridge').attr('width', 20).attr('x', newSize.width).attr('height', newSize.height)
            nodeGroup.select('.node-hover-layer').attr('width', newSize.width + 40).attr('height', newSize.height)
            
            // ⚠️ CRITICAL: Cập nhật nodes.value TRƯỚC khi gọi setData và render
            const vueNode = nodes.value.find(n => n.id === nodeId)
            if (vueNode && vueNode.data) {
              vueNode.data.rect = { width: newSize.width, height: newSize.height }
              vueNode.data.fixedWidth = newSize.width
              vueNode.data.fixedHeight = newSize.height
            }
            
            // ⚠️ CRITICAL: Cập nhật d3Node.data.rect
            const d3Node = renderer.nodes.find((n) => n.id === nodeId)
            if (d3Node) {
              if (!d3Node.data) d3Node.data = {}
              d3Node.data.rect = { width: newSize.width, height: newSize.height }
              d3Node.data.fixedWidth = newSize.width
              d3Node.data.fixedHeight = newSize.height
            }
            
            if (renderer.positions) {
              renderer.positions.delete(nodeId)
            }
            
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (renderer) {
                  const hasAnyNodeBeingEdited = !!editingNode.value
                  
                  if (hasAnyNodeBeingEdited) {
                    // ⚠️ CRITICAL: KHÔNG gọi setData() khi có node đang được edit
                    // Chỉ update d3Node.data trực tiếp
                    const d3Node = renderer.nodes.find((n) => n.id === nodeId)
                    if (d3Node) {
                      if (!d3Node.data) d3Node.data = {}
                      d3Node.data.rect = { width: newSize.width, height: newSize.height }
                      d3Node.data.fixedWidth = newSize.width
                      d3Node.data.fixedHeight = newSize.height
                    }
                    console.log(`[Realtime] ⚠️ Đã cập nhật kích thước nhưng KHÔNG gọi setData/render vì có node đang được edit: ${nodeId}`)
                  } else {
                    renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
                    
                    const d3NodeAfterSetData = renderer.nodes.find((n) => n.id === nodeId)
                    if (d3NodeAfterSetData) {
                      if (!d3NodeAfterSetData.data) d3NodeAfterSetData.data = {}
                      d3NodeAfterSetData.data.rect = { width: newSize.width, height: newSize.height }
                      d3NodeAfterSetData.data.fixedWidth = newSize.width
                      d3NodeAfterSetData.data.fixedHeight = newSize.height
                    }
                    
                    if (safeRender(renderer, false)) {
                      console.log(`[Realtime] ✅ Đã cập nhật kích thước và render lại cho node ${nodeId}: ${newSize.width}x${newSize.height}`)
                    }
                  }
                }
              })
            })
          }
          
          // Code để xử lý size calculation sau khi editor đã được mount và content đã được set
          // Đợi đủ lâu để đảm bảo editor đã được mount và content đã được set (mount editor mất ~100ms + setContent)
          setTimeout(() => {
            // ⚠️ CRITICAL: Không tính toán lại kích thước nếu node này đang được edit
            if (editingNode.value === remoteNode.id) {
              console.log(`[Realtime] ⚠️ Bỏ qua tính toán lại kích thước (setTimeout) cho node ${remoteNode.id} vì node này đang được edit`)
              return
            }
            
            const editorInstance = renderer.getEditorInstance(remoteNode.id)
            if (editorInstance && !editorInstance.isDestroyed) {
              try {
                // Đảm bảo label có giá trị
                if (!remoteNode.data?.label || remoteNode.data.label.trim() === '') {
                  console.warn(`[Realtime] ⚠️ Node ${remoteNode.id} không có label, bỏ qua tính toán size`)
                  return
                }
                
                requestAnimationFrame(() => {
                setTimeout(() => {
                  requestAnimationFrame(() => {
                    const nodeGroup = renderer.g.select(`[data-node-id="${remoteNode.id}"]`)
                    if (!nodeGroup.empty()) {
                      const rect = nodeGroup.select('.node-rect')
                      const fo = nodeGroup.select('.node-text')
                      
                      if (!rect.empty() && !fo.empty()) {
                        const editorDOM = editorInstance.view?.dom
                        const editorContent = editorDOM?.querySelector('.mindmap-editor-prose') || editorDOM
                        
                        if (editorContent) {
                          const borderOffset = 4
                          const maxWidth = 400
                          const singleLineHeight = Math.ceil(19 * 1.4) + 16
                          
                          const hasImages = remoteNode.data?.label?.includes('<img') || remoteNode.data?.label?.includes('image-wrapper')
                          
                          let newSize
                          if (hasImages) {
                            newSize = { width: maxWidth, height: singleLineHeight }
                          } else {
                            // ⚠️ FIX: Tính toán lại kích thước dựa trên remoteNode.data.label
                            // KHÔNG dùng editorContent vì editor có thể chưa được cập nhật đúng lúc
                            // Code tính toán lại kích thước chính xác sẽ được gọi trong calculateAndUpdateNodeSize
                            // sau khi content đã được set vào editor
                            newSize = renderer.estimateNodeSize(remoteNode)
                            console.log(`[Realtime] 📐 Tính toán lại kích thước (tạm thời) cho node ${remoteNode.id}:`, {
                              remoteLabel: remoteNode.data?.label?.substring(0, 50),
                              estimatedSize: newSize
                            })
                          }
                          
                          const foWidth = Math.max(0, newSize.width - borderOffset)
                          
                          rect.attr('width', newSize.width)
                          rect.node()?.setAttribute('width', newSize.width)
                          fo.attr('width', foWidth)
                          fo.node()?.setAttribute('width', foWidth)
                          
                          editorContent.style.setProperty('box-sizing', 'border-box', 'important')
                          editorContent.style.setProperty('width', `${foWidth}px`, 'important')
                          editorContent.style.setProperty('height', 'auto', 'important')
                          editorContent.style.setProperty('min-height', `${singleLineHeight}px`, 'important')
                          editorContent.style.setProperty('max-height', 'none', 'important')
                          editorContent.style.setProperty('overflow', 'visible', 'important')
                          editorContent.style.setProperty('padding', '8px 16px', 'important')
                          
                          const whiteSpaceValue = (newSize.width >= maxWidth || hasImages) ? 'pre-wrap' : 'nowrap'
                          editorContent.style.setProperty('white-space', whiteSpaceValue, 'important')
                          editorContent.style.setProperty('overflow-wrap', 'break-word', 'important')
                          
                          const wrapperNode = fo.select('.node-content-wrapper').node()
                          if (wrapperNode) {
                            wrapperNode.style.setProperty('width', '100%', 'important')
                            wrapperNode.style.setProperty('height', 'auto', 'important')
                            wrapperNode.style.setProperty('min-height', '0', 'important')
                            wrapperNode.style.setProperty('max-height', 'none', 'important')
                            wrapperNode.style.setProperty('overflow', 'visible', 'important')
                          }
                          
                          const containerNode = fo.select('.node-editor-container').node()
                          if (containerNode) {
                            containerNode.style.setProperty('width', '100%', 'important')
                            containerNode.style.setProperty('height', 'auto', 'important')
                            containerNode.style.setProperty('min-height', '0', 'important')
                            containerNode.style.setProperty('max-height', 'none', 'important')
                            containerNode.style.setProperty('overflow', 'visible', 'important')
                          }
                          
                          void editorContent.offsetWidth
                          void editorContent.offsetHeight
                          void editorContent.scrollHeight
                          
                          setTimeout(() => {
                            if (hasImages) {
                              const images = editorContent.querySelectorAll('img')
                              const allImagesLoaded = Array.from(images).every(img => img.complete && img.naturalHeight > 0)
                              
                              if (allImagesLoaded) {
                                const heightResult = calculateNodeHeightWithImages({
                                  editorContent,
                                  nodeWidth: newSize.width,
                                  htmlContent: remoteNode.data.label,
                                  singleLineHeight
                                })
                                newSize.height = heightResult.height
                              } else {
                                const imageLoadPromises = Array.from(images)
                                  .filter(img => !img.complete || img.naturalHeight === 0)
                                  .map(img => new Promise((resolve) => {
                                    if (img.complete && img.naturalHeight > 0) {
                                      resolve()
                                    } else {
                                      img.addEventListener('load', resolve, { once: true })
                                      img.addEventListener('error', () => {
                                        resolve()
                                      }, { once: true })
                                    }
                                  }))
                                
                                Promise.all(imageLoadPromises).then(() => {
                                  setTimeout(() => {
                                    const heightResult = calculateNodeHeightWithImages({
                                      editorContent,
                                      nodeWidth: newSize.width,
                                      htmlContent: remoteNode.data.label,
                                      singleLineHeight
                                    })
                                    newSize.height = heightResult.height
                                    
                                    renderer.nodeSizeCache.set(remoteNode.id, newSize)
                                    
                                    const node = renderer.nodes.find((n) => n.id === remoteNode.id)
                                    if (node && !node.data) node.data = {}
                                    
                                    // ⚠️ CRITICAL: Update node.data.rect để D3 biết size mới khi vẽ edges
                                    if (node) {
                                      node.data.rect = { width: newSize.width, height: newSize.height }
                                    }
                                    
                                    rect.attr('height', newSize.height)
                                    rect.node()?.setAttribute('height', newSize.height)
                                    
                                    const foHeight = Math.max(0, newSize.height - borderOffset)
                                    fo.attr('height', foHeight)
                                    fo.node()?.setAttribute('height', foHeight)
                                    
                                    // Re-select wrapperNode và containerNode trong scope này
                                    const wrapperNode2 = fo.select('.node-content-wrapper').node()
                                    if (wrapperNode2) {
                                      wrapperNode2.style.setProperty('height', `${foHeight}px`, 'important')
                                      wrapperNode2.style.setProperty('min-height', `${foHeight}px`, 'important')
                                    }
                                    
                                    const containerNode2 = fo.select('.node-editor-container').node()
                                    if (containerNode2) {
                                      containerNode2.style.setProperty('height', `${foHeight}px`, 'important')
                                      containerNode2.style.setProperty('min-height', `${foHeight}px`, 'important')
                                    }
                                    
                                    // foWidth đã được set ở trên (dòng 6304), không cần set lại
                                    
                                    nodeGroup.select('.add-child-btn').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                                    nodeGroup.select('.add-child-text').attr('x', newSize.width + 20).attr('y', newSize.height / 2)
                                    nodeGroup.select('.collapse-btn-number').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                                    nodeGroup.select('.collapse-text-number').attr('x', newSize.width + 20).attr('y', newSize.height / 2)
                                    nodeGroup.select('.collapse-btn-arrow').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                                    nodeGroup.select('.collapse-arrow').attr('transform', `translate(${newSize.width + 20}, ${newSize.height / 2}) scale(0.7) translate(-12, -12)`)
                                    nodeGroup.select('.collapse-button-bridge').attr('width', 20).attr('x', newSize.width).attr('height', newSize.height)
                                    nodeGroup.select('.node-hover-layer').attr('width', newSize.width + 40).attr('height', newSize.height)
                                    
                                    // ⚠️ CRITICAL: Update nodes.value với size mới để D3 biết khi recalculate layout
                                    const vueNode = nodes.value.find(n => n.id === remoteNode.id)
                                    if (vueNode && vueNode.data) {
                                      vueNode.data.rect = { width: newSize.width, height: newSize.height }
                                    }
                                    
                                    // Clear position của node này để force recalculate
                                    if (renderer.positions) {
                                      renderer.positions.delete(remoteNode.id)
                                    }
                                    
                                    // ⚠️ CRITICAL: Kiểm tra xem có node đang được edit không
                                    requestAnimationFrame(() => {
                                      if (renderer) {
                                        const hasAnyNodeBeingEdited = !!editingNode.value
                                        
                                        if (hasAnyNodeBeingEdited) {
                                          // ⚠️ CRITICAL: KHÔNG gọi setData() khi có node đang được edit
                                          // Chỉ update d3Node.data trực tiếp
                                          const d3Node = renderer.nodes.find((n) => n.id === remoteNode.id)
                                          if (d3Node) {
                                            if (!d3Node.data) d3Node.data = {}
                                            d3Node.data.rect = { width: newSize.width, height: newSize.height }
                                            d3Node.data.fixedWidth = newSize.width
                                            d3Node.data.fixedHeight = newSize.height
                                          }
                                          console.log(`[Realtime] ⚠️ Đã cập nhật size nhưng KHÔNG gọi setData/render vì có node đang được edit: ${remoteNode.id}`)
                                        } else {
                                          renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
                                          if (safeRender(renderer, false)) {
                                            console.log(`[Realtime] ✅ Đã cập nhật size và render lại cho node ${remoteNode.id}: ${newSize.width}x${newSize.height}`)
                                          }
                                        }
                                      }
                                    })
                                  }, 20)
                                })
                                return
                              }
                            } else {
                              const contentScrollHeight = editorContent.scrollHeight || editorContent.offsetHeight || 0
                              newSize.height = Math.max(contentScrollHeight, singleLineHeight)
                            }
                            
                            renderer.nodeSizeCache.set(remoteNode.id, newSize)
                            
                            const node = renderer.nodes.find((n) => n.id === remoteNode.id)
                            if (node && !node.data) node.data = {}
                            
                            // ⚠️ CRITICAL: Update node.data.rect để D3 biết size mới khi vẽ edges
                            if (node) {
                              node.data.rect = { width: newSize.width, height: newSize.height }
                            }
                            
                            rect.attr('width', newSize.width)
                            rect.attr('height', newSize.height)
                            rect.node()?.setAttribute('width', newSize.width)
                            rect.node()?.setAttribute('height', newSize.height)
                            
                            const foWidth = Math.max(0, newSize.width - borderOffset)
                            const foHeight = Math.max(0, newSize.height - borderOffset)
                            fo.attr('width', foWidth)
                            fo.attr('height', foHeight)
                            fo.node()?.setAttribute('width', foWidth)
                            fo.node()?.setAttribute('height', foHeight)
                            
                            const wrapperNode = fo.select('.node-content-wrapper').node()
                            if (wrapperNode) {
                              wrapperNode.style.setProperty('width', '100%', 'important')
                              wrapperNode.style.setProperty('height', `${foHeight}px`, 'important')
                              wrapperNode.style.setProperty('min-height', `${foHeight}px`, 'important')
                              wrapperNode.style.setProperty('max-height', 'none', 'important')
                              wrapperNode.style.setProperty('overflow', 'visible', 'important')
                            }
                            
                            const containerNode = fo.select('.node-editor-container').node()
                            if (containerNode) {
                              containerNode.style.setProperty('width', '100%', 'important')
                              containerNode.style.setProperty('height', `${foHeight}px`, 'important')
                              containerNode.style.setProperty('min-height', `${foHeight}px`, 'important')
                              containerNode.style.setProperty('max-height', 'none', 'important')
                              containerNode.style.setProperty('overflow', 'visible', 'important')
                            }
                            
                            editorContent.style.setProperty('width', `${foWidth}px`, 'important')
                            
                            nodeGroup.select('.add-child-btn').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                            nodeGroup.select('.add-child-text').attr('x', newSize.width + 20).attr('y', newSize.height / 2)
                            nodeGroup.select('.collapse-btn-number').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                            nodeGroup.select('.collapse-text-number').attr('x', newSize.width + 20).attr('y', newSize.height / 2)
                            nodeGroup.select('.collapse-btn-arrow').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                            nodeGroup.select('.collapse-arrow').attr('transform', `translate(${newSize.width + 20}, ${newSize.height / 2}) scale(0.7) translate(-12, -12)`)
                            nodeGroup.select('.collapse-button-bridge').attr('width', 20).attr('x', newSize.width).attr('height', newSize.height)
                            nodeGroup.select('.node-hover-layer').attr('width', newSize.width + 40).attr('height', newSize.height)
                            
                            // ⚠️ CRITICAL: Update nodes.value với size mới để D3 biết khi recalculate layout
                            const vueNode = nodes.value.find(n => n.id === remoteNode.id)
                            if (vueNode && vueNode.data) {
                              vueNode.data.rect = { width: newSize.width, height: newSize.height }
                            }
                            
                            // Clear position của node này để force recalculate
                            if (renderer.positions) {
                              renderer.positions.delete(remoteNode.id)
                            }
                            
                            // ⚠️ CRITICAL: Kiểm tra xem có node đang được edit không
                            requestAnimationFrame(() => {
                              if (renderer) {
                                const hasAnyNodeBeingEdited = !!editingNode.value
                                
                                if (hasAnyNodeBeingEdited) {
                                  // ⚠️ CRITICAL: KHÔNG gọi setData() khi có node đang được edit
                                  // Chỉ update d3Node.data trực tiếp
                                  const d3Node = renderer.nodes.find((n) => n.id === remoteNode.id)
                                  if (d3Node) {
                                    if (!d3Node.data) d3Node.data = {}
                                    d3Node.data.rect = { width: newSize.width, height: newSize.height }
                                    d3Node.data.fixedWidth = newSize.width
                                    d3Node.data.fixedHeight = newSize.height
                                  }
                                  console.log(`[Realtime] ⚠️ Đã cập nhật size nhưng KHÔNG gọi setData/render vì có node đang được edit: ${remoteNode.id}`)
                                } else {
                                  renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
                                  if (safeRender(renderer, false)) {
                                    console.log(`[Realtime] ✅ Đã cập nhật size và render lại cho node ${remoteNode.id}: ${newSize.width}x${newSize.height}`)
                                  }
                                }
                              }
                            })
                          }, 50)
                        }
                      }
                    }
                  })
                }, 10)
              })
            } catch (err) {
              console.error('Error updating node content:', err)
            }
          } else {
            console.warn(`[Realtime] ⚠️ Editor instance không tồn tại cho node ${remoteNode.id} khi tính toán size`)
          }
        }, 150) // ⚠️ FIX: Giảm delay từ 200ms xuống 150ms để đảm bảo tính toán lại kích thước được gọi sớm hơn
        })
      }
  }

  return {
    handleRealtimeNodesDeleted,
    handleRealtimeNodeEditing,
    handleRealtimeNodesBatchUpdate,
    handleRealtimeNodeUpdate
  }
}

