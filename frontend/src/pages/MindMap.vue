<template>
  <div class="flex flex-col w-full mindmap-page">
    <Navbar v-if="!pageError && !mindmap.error && !mindmapEntity.error" :root-resource="mindmapEntity" />
    <ErrorPage v-if="pageError || mindmap.error || mindmapEntity.error" :error="pageError || mindmap.error || mindmapEntity.error" />
    <LoadingIndicator v-else-if="!mindmap.data && mindmap.loading" class="w-10 h-full text-neutral-100 mx-auto" />

    <div v-if="mindmap.data && !mindmapEntity.error" class="w-full relative">
      <!-- Loading indicator khi đang render mindmap -->
      <div v-if="currentView === 'visual' && isRendering" class="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50">
        <div class="text-center">
          <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <div class="text-lg text-gray-600 mt-4">Đang tải sơ đồ tư duy...</div>
        </div>
      </div>

      <!-- Status indicator -->
      <div class="fixed top-20 right-2 z-10 text-sm">
        <span v-if="isSaving" class="text-orange-500 flex items-center gap-1">
          <span class="animate-spin">⏳</span> Đang lưu...
        </span>
        <span v-else-if="lastSaved" class="text-green-500">
          ✓ Đã lưu lúc {{ lastSaved }}
        </span>
      </div>

      <Teleport to="body">
        <div @click="showPanel = true" class="absolute cursor-pointer top-[120px] right-0 z-10 text-sm
              border border-gray-300 border-r-0
              rounded-tl-[20px] rounded-bl-[20px]
              bg-white pl-3 py-3 flex
              hover:text-[#3b82f6]
              transition-all duration-200 ease-out">
        <span>
          <i class="pi pi-comment !text-[16px]"></i>
        </span>
      </div>
      </Teleport>



      <!-- Delete confirmation dialog -->
      <div v-if="showDeleteDialog" class="delete-dialog-overlay" @click.self="closeDeleteDialog">
        <div class="delete-dialog">
          <div class="delete-dialog-header">
            <h3>Xác nhận xóa</h3>
          </div>
          <div class="delete-dialog-body">
            <p v-if="deleteDialogType === 'children'">Xóa nhánh này sẽ xóa toàn bộ nhánh con.</p>
            <p v-else-if="deleteDialogType === 'task-link'">Nhánh đang có liên kết tới công việc, xóa nhánh này</p>
          </div>
          <div class="delete-dialog-footer">
            <button @click="closeDeleteDialog" class="btn-cancel">Hủy</button>
            <button @click="confirmDelete" class="btn-delete">Xóa</button>
          </div>
        </div>
      </div>

      <!-- Task link drag warning dialog -->
      <div v-if="showTaskLinkDragDialog" class="delete-dialog-overlay" @click.self="closeTaskLinkDragDialog">
        <div class="delete-dialog">
          <div class="delete-dialog-header">
            <h3>Cảnh báo</h3>
          </div>
          <div class="delete-dialog-body">
            <p>Nhánh đang được liên kết tới công việc, bạn vẫn muốn thay đổi vị trí nhánh?</p>
          </div>
          <div class="delete-dialog-footer">
            <button @click="closeTaskLinkDragDialog" class="btn-cancel">Hủy</button>
            <button @click="confirmTaskLinkDrag" class="btn-delete">Xác nhận</button>
          </div>
        </div>
      </div>

      <MindmapTaskLinkModal
        :visible="showTaskLinkModal"
        :node-title="extractTitleFromLabel(taskLinkNode?.data?.label || '') || taskLinkNode?.data?.label || ''"
        :mode="taskLinkMode"
        :search="taskSearch"
        :tasks="filteredTasks"
        :project-filter="taskProjectFilter"
        :project-options="taskProjectOptions"
        :page="taskPage"
        :total-pages="totalTaskPages"
        :selected-task-id="selectedTaskId"
        :link-url="taskLinkUrl"
        :node-owner="mindmapEntity?.data?.owner || ''"
        :mindmap-title="mindmap?.data?.title || ''"
        :team="props.team"
        :mindmap-id="props.entityName"
        :node-id="taskLinkNode?.id || ''"
        @update:mode="taskLinkMode = $event"
        @update:search="taskSearchInput = $event"
        @update:selectedTaskId="selectedTaskId = $event"
        @update:linkUrl="taskLinkUrl = $event"
        @update:projectFilter="taskProjectFilter = $event"
        @update:page="setTaskPage($event)"
        @close="closeTaskLinkModal"
        @confirm="confirmTaskLink"
        @createTask="handleCreateTask"
      />

      <!-- Undo/Redo buttons - Top left -->
      <div class="fixed top-[100px] z-10 flex gap-2" :style="{ left: controlsLeft }">
        <!-- Undo Button -->
        <button 
          @click="undo" 
          class="control-btn transition-colors" 
          :class="{ 'opacity-50 cursor-not-allowed': !canUndo }"
          :disabled="!canUndo"
          v-tooltip.right="{ value: 'Hoàn tác (Ctrl+Z)', pt: { text: { class: ['text-[12px]'] } } }"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7v6h6"/>
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
          </svg>
        </button>
        
        <!-- Redo Button -->
        <button 
          @click="redo" 
          class="control-btn transition-colors" 
          :class="{ 'opacity-50 cursor-not-allowed': !canRedo }"
          :disabled="!canRedo"
          v-tooltip.right="{ value: 'Làm lại (Ctrl+Y)', pt: { text: { class: ['text-[12px]'] } } }"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 7v6h-6"/>
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>
          </svg>
        </button>
      </div>

      <!-- Change view mindmap -->
      <div class="fixed top-[160px] z-10 flex flex-col gap-2" :style="{ left: controlsLeft }">
        <!-- TEXT VIEW -->
        <button
          v-tooltip.right="{ value: 'Phác thảo', pt: { text: { class: ['text-[12px]'] } } }"
          @click="currentView = 'text'"
          class="control-btn transition-colors"
          :class="{
            'bg-blue-50 border-blue-400': currentView === 'text',
          }"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 32 32"
            :fill="currentView === 'text' ? '#2563eb' : '#000000'"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 14h-2c-0.552 0-1 0.448-1 1v2c0 0.552 0.448 1 1 1h2c0.552 0 1-0.448 1-1v-2c0-0.552-0.448-1-1-1zM31 15h-21c-0.552 0-1 0.448-1 1s0.448 1 1 1h21c0.552 0 1-0.448 1-1s-0.448-1-1-1zM3 22h-2c-0.552 0-1 0.448-1 1v2c0 0.552 0.448 1 1 1h2c0.552 0 1-0.448 1-1v-2c0-0.552-0.448-1-1-1zM31 23h-21c-0.552 0-1 0.448-1 1s0.448 1 1 1h21c0.552 0 1-0.448 1-1s-0.448-1-1-1zM3 6h-2c-0.552 0-1 0.448-1 1v2c0 0.552 0.448 1 1 1h2c0.552 0 1-0.448 1-1v-2c0-0.552-0.448-1-1-1zM10 9h21c0.552 0 1-0.448 1-1s-0.448-1-1-1h-21c-0.552 0-1 0.448-1 1s0.448 1 1 1z"
            />
          </svg>
        </button>

        <!-- VISUAL VIEW -->
        <button
          v-tooltip.right="{ value: 'Bản đồ tư duy', pt: { text: { class: ['text-[12px]'] } } }"
          @click="currentView = 'visual'"
          class="control-btn transition-colors"
          :class="{
            'bg-blue-50 border-blue-400': currentView === 'visual',
          }"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 48 48"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M26 24L42 24"
              :stroke="currentView === 'visual' ? '#2563eb' : '#000000'"
              stroke-width="4"
              stroke-linecap="round"
            />
            <path
              d="M26 38H42"
              :stroke="currentView === 'visual' ? '#2563eb' : '#000000'"
              stroke-width="4"
              stroke-linecap="round"
            />
            <path
              d="M26 10H42"
              :stroke="currentView === 'visual' ? '#2563eb' : '#000000'"
              stroke-width="4"
              stroke-linecap="round"
            />
            <path
              d="M18 24L6 24C6 24 7.65685 24 10 24M18 38C12 36 16 24 10 24M18 10C12 12 16 24 10 24"
              :stroke="currentView === 'visual' ? '#2563eb' : '#000000'"
              stroke-width="4"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>



      <div v-show="currentView === 'visual'" style="height: calc(100vh - 84px); width: 100%" class="d3-mindmap-container">
        <!-- D3.js Mindmap Renderer -->
        <div ref="d3Container" class="d3-mindmap-wrapper"></div>

        <!-- Controls -->
        <div class="d3-controls" :style="{ left: controlsLeft }">
          <button @click="fitView" class="control-btn" title="Fit View">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 2h12v12H2V2z" />
              <path d="M5 5h6v6H5V5z" />
            </svg>
          </button>
          <button @click="zoomIn" class="control-btn" title="Zoom In">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
          <button @click="zoomOut" class="control-btn" title="Zoom Out">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
          <button @click="showExportDialog = true" class="control-btn" title="Xuất sơ đồ">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 2v8M5 7l3 3 3-3" />
              <path d="M2 12h12" />
            </svg>
          </button>
        </div>

        <MindmapContextMenu @mousedown.stop @click.stop :visible="showContextMenu" :node="contextMenuNode"
          :position="contextMenuPos" :has-clipboard="hasClipboard" :center="contextMenuCentered"
          :permissions="permissions"
          @action="handleContextMenuAction" @close="showContextMenu = false" />

        <!-- Mindmap Toolbar -->
        <MindmapToolbar ref="toolbarRef" :visible="!!selectedNode" :selected-node="selectedNode"
          :editor-instance="currentEditorInstance" :is-editing="editingNode === selectedNode?.id" :renderer="d3Renderer"
          :permissions="permissions"
          @comments="handleToolbarComments" @done="handleToolbarDone" @insert-image="handleInsertImage"
          @more-options="handleToolbarMoreOptions" @context-action="handleToolbarContextAction" :nodeActive="activeCommentNode" :showPanel="showPanel"/>

        <!-- Image Zoom Modal - Global, chỉ 1 instance -->
        <ImageZoomModal />

        <!-- Export/Import Dialog -->
        <MindmapExportDialog
          v-model:visible="showExportDialog"
          :d3-renderer="d3Renderer"
          :d3-container="d3Container"
          :nodes="nodes"
          :edges="edges"
          :mindmap="mindmap.data"
          :node-creation-order="nodeCreationOrder"
          :entity-name="entityName"
          @imported="handleImportComplete"
        />
      </div>

        <MindmapCommentPanel :current-view="currentView" @open-history="showPanel = true" :visible="showPanel" :node="activeCommentNode" :mindmap="realtimeMindmapNodes"
          @close="showPanel = false" ref="commentPanelRef" @update:input="commentInputValue = $event"
          @cancel="onCancelComment" @update:node="handleSelectCommentNode" @highlight:node="handleHighlightNode" :userAddComment="isFromUI">
        </MindmapCommentPanel>
        
        <!-- Permission Modal -->
        <div v-if="showPermissionModal" class="permission-modal-overlay">
          <div class="permission-modal">
            <div class="modal-header">
              <h3>⚠️ Quyền truy cập đã thay đổi</h3>
            </div>
            <div class="modal-body">
              <p>{{ permissionModalMessage }}</p>
              <p>Trang sẽ tải lại trong <strong>{{ permissionModalCountdown }}</strong> giây...</p>
            </div>
          </div>
        </div>

        <div
          v-if="currentView === 'text'"
          class="w-full h-[calc(100vh-84px)] flex items-center justify-center text-gray-400"
        >
          <MindmapTextModeView 
          ref="textViewRef"
          :nodes="nodes"
          :edges="edges" 
          :version="textViewVersion"
          :active-comment-node="activeCommentNode"
          :permissions="permissions"
          @rename-title="renameMindmapTitle"
          @update-nodes="applyTextEdits"
          @open-comment="onOpenComment"
          @add-child-node="addChildToNodeTextMode"
          @done-node="handleTextModeDone"
          @copy-node="handleTextModeCopy"
          @task-link-node="handleTextModeTaskLink"
          @delete-node="handleTextModeDeleteNode"
          @unlink-task-node="handleUnlinkTaskNode"
          @insert-images="handleInsertImagesTextMode"
          />
        </div>
    </div>
  </div>
</template>

<script setup>
import { rename } from "@/resources/files"
import { D3MindmapRenderer } from '@/utils/d3mindmap'
import { calculateNodeHeightWithImages } from '@/utils/d3mindmap/nodeSize.js'
import { scrollToNode } from '@/utils/d3mindmap/viewUtils'
import { installMindmapContextMenu } from '@/utils/mindmapExtensions'

import { useRecentFiles } from "@/composables/useRecentFiles"
import { setBreadCrumbs } from "@/utils/files"
import { uploadImageToMindmap } from '@/utils/mindmapImageUpload'
import { toast } from "@/utils/toasts"
import { generateUUID } from "@/utils/uuid"
import { call, createResource } from "frappe-ui"
import { computed, defineProps, inject, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from "vue"
import { useStore } from "vuex"

import { useRoute } from "vue-router"


import ErrorPage from "@/components/ErrorPage.vue"
import ImageZoomModal from "@/components/ImageZoomModal.vue"
import MindmapCommentPanel from "@/components/Mindmap/MindmapCommentPanel.vue"
import MindmapContextMenu from "@/components/Mindmap/MindmapContextMenu.vue"
import MindmapExportDialog from "@/components/Mindmap/MindmapExportDialog.vue"
import MindmapTaskLinkModal from "@/components/Mindmap/MindmapTaskLinkModal.vue"
import MindmapToolbar from "@/components/Mindmap/MindmapToolbar.vue"
import { provide } from "vue"
import { computeInsertAfterAnchor, computeInsertAsFirstChild, computeInsertAsLastRootChild, computeInsertBeforeAnchor, computeInsertBeforeAnchorSplit, moveNodeAsLastChild } from "../components/Mindmap/components/engine/nodeOrderEngine"
import MindmapTextModeView from "../components/Mindmap/MindmapTextModeView.vue"

import { useMindmapClipboard } from '@/composables/useMindmapClipboard'
import { useMindmapComments } from '@/composables/useMindmapComments'
import { useMindmapDelete } from '@/composables/useMindmapDelete'
import { useMindmapHistory } from '@/composables/useMindmapHistory'
import { useMindmapKeyboard } from '@/composables/useMindmapKeyboard'
import { useMindmapNodes } from '@/composables/useMindmapNodes'
import { useMindmapPermissions } from '@/composables/useMindmapPermissions'
import { useMindmapRealtimeComments } from '@/composables/useMindmapRealtimeComments'
import { useMindmapRealtimeNodes } from '@/composables/useMindmapRealtimeNodes'
import { useMindmapRendererHelpers } from '@/composables/useMindmapRendererHelpers'
import { useMindmapSave } from '@/composables/useMindmapSave'
import { useMindmapState } from '@/composables/useMindmapState'
import { useMindmapTasks } from '@/composables/useMindmapTasks'
import { useMindmapToolbar } from '@/composables/useMindmapToolbar'
import { useMindmapUIActions } from '@/composables/useMindmapUIActions'
import { useMindmapViewControls } from '@/composables/useMindmapViewControls'
import {
  extractTitleFromLabel as extractTitleHelper,
  generateNodeId as generateNodeIdHelper,
  getDefaultTaskLink,
  getTaskOpenUrl,
  resolveTaskLinkNode as resolveTaskLinkNodeHelper
} from '@/utils/mindmapHelpers'

const store = useStore()
const emitter = inject("emitter")
const socket = inject("socket")
const suppressPanelAutoFocus = ref(false)
// ⚠️ FIX: Track các node đã được scale để tránh scale lại (gây loop)
const scaledNodesAfterImport = ref(new Set())
provide("suppressPanelAutoFocus", suppressPanelAutoFocus)

// ⚠️ FIX: Tính toán vị trí controls dựa trên trạng thái sidebar
// Sidebar expanded: 260px, collapsed: 60px
// Margin: 40px
const controlsLeft = computed(() => {
  const isSidebarExpanded = store.state.IsSidebarExpanded
  const sidebarWidth = isSidebarExpanded ? 260 : 60
  const margin = 40
  return `${sidebarWidth + margin}px`
})

const pageError = computed(() => {
  const bootError = window.frappe?.boot?.error
  if (bootError) {
    return { message: bootError.message || "Đã xảy ra lỗi" }
  }
  return null
})

const props = defineProps({
  entityName: String,
  team: String,
})

// Use recent files composable
let addRecentFile = null
try {
  const recentFilesComposable = useRecentFiles()
  addRecentFile = recentFilesComposable.addRecentFile
  console.log('✅ [MindMap.vue] useRecentFiles loaded successfully')
} catch (error) {
  console.error('❌ [MindMap.vue] Error loading useRecentFiles:', error)
}

// Resources - khai báo trước để tránh temporal dead zone
// Forward declarations để tránh temporal dead zone
let initializeMindmap
let openTaskLinkModal
let deleteTaskLink
let scheduleSave

const mindmap = createResource({
  url: "drive.api.mindmap.get_mindmap_data",
  method: "GET",
  auto: false, // Đổi thành false để fetch sau khi setup xong
  params: {
    entity_name: props.entityName,
  },
  onSuccess(data) {
    window.document.title = data.title
    store.commit("setActiveEntity", data)
    
    // ⚠️ FIX: Lưu collapsed_nodes từ API response
    if (data.collapsed_nodes && Array.isArray(data.collapsed_nodes)) {
      collapsedNodesFromDB.value = data.collapsed_nodes
      console.log(`[Collapse] 📖 Loaded ${data.collapsed_nodes.length} collapsed nodes from database:`, data.collapsed_nodes)
    } else {
      collapsedNodesFromDB.value = []
    }
    
    // ⚠️ NEW: Restore editing states từ API response
    if (data.editing_users && Array.isArray(data.editing_users)) {
      console.log(`[Editing] 📖 Restoring ${data.editing_users.length} editing states from API:`, data.editing_users)
      data.editing_users.forEach(({ node_id, user_id, user_name }) => {
        nodeEditingUsers.value.set(node_id, {
          userId: user_id,
          userName: user_name
        })
      })
      console.log(`[Editing] ✅ Restored editing states:`, Array.from(nodeEditingUsers.value.entries()))
    }
    
    initializeMindmap(data)
  },
  onError(error) {
    
  }
})

const mindmapEntity = createResource({
  url: "drive.api.permissions.get_entity_with_permissions",
  method: "GET",
  auto: false, // Đổi thành false để fetch sau khi setup xong
  params: {
    entity_name: props.entityName,
  },
  onSuccess(data) {
    console.log('🎉 [MindMap.vue] mindmapEntity onSuccess called with data:', data)
    
    permissions.value = {
      read: data.read || 0,
      write: data.write || 0,
      comment: data.comment || 0,
      share: data.share || 0
    }
    
    if (data.breadcrumbs && Array.isArray(data.breadcrumbs)) {
      setBreadCrumbs(data.breadcrumbs, data.is_private, () => {
        data.write && emitter.emit("rename")
      })
    }
    
    // Track mindmap file đã được xem vào recent files
    console.log('🔍 [MindMap.vue] Checking if should track file:', { name: data.name, isGroup: data.is_group })
    
    if (data && !data.is_group) {
      const fileInfo = {
        name: data.name,
        title: data.title,
        mime_type: 'mindmap', // Mindmap có mime_type đặc biệt
        file_ext: 'mindmap',
        modified: data.modified,
        owner: data.owner,
        is_group: data.is_group,
        team: props.team, // Include team info for correct URL generation
      }
      
      console.log('📝 [MindMap.vue] File info to track:', fileInfo)
      
      // Add to local recent files
      if (addRecentFile) {
        console.log('🔧 [MindMap.vue] Calling addRecentFile...')
        addRecentFile(fileInfo)
      } else {
        console.warn('⚠️ [MindMap.vue] addRecentFile is not available')
      }
      
      // Send message to parent window (MTP) if inside iframe
      if (window.parent && window.parent !== window) {
        try {
          console.log('📤 [MindMap.vue] Sending file_accessed message to parent:', fileInfo)
          window.parent.postMessage({
            type: 'drive:file_accessed',
            payload: fileInfo
          }, '*')
        } catch (error) {
          console.warn('[MindMap.vue] Cannot send message to parent window:', error)
        }
      } else {
        console.log('⚠️ [MindMap.vue] Not in iframe, file tracking only local')
      }
    } else {
      console.log('⏭️ [MindMap.vue] Skipping file tracking (not a file or is a group)')
    }
  },
})

// Setup composables
const {
  isSaving, savingCount, lastSaved,
  selectedNode, changedNodeIds, hoveredNode, editingNode,
  nodeEditingUsers, lastBroadcastState, editingStartTime,
  isRendering,
  showPanel, activeCommentNode, commentPanelRef, commentInputValue, isFromUI,
  isMindmapReady, toolbarRef, elements, d3Container,
  currentView, textViewVersion,
  showContextMenu, contextMenuPos, contextMenuNode, contextMenuCentered,
  showExportDialog, nodes, edges, formatTime
} = useMindmapState()

const {
  permissions,
  showPermissionModal,
  permissionModalTimer,
  permissionModalCountdown,
  permissionModalMessage,
  cachedPermissionVersion,
  initializePermissionVersion,
  handlePermissionChanged,
  handleSocketPermissionRevoked,
  setupPermissionWatcher,
  reloadPageNow,
  cleanup: cleanupPermissions
} = useMindmapPermissions()

const {
  showTaskLinkModal, taskLinkNode, taskLinkMode,
  taskSearch, taskSearchInput, selectedTaskId, taskLinkUrl,
  taskProjectFilter, taskPage, TASK_PAGE_SIZE,
  taskOptions, taskPagination, taskLoading, taskProjectOptionMap,
  taskProjectOptions, filteredTasksRaw, totalTaskPages, filteredTasks,
  fetchProjectOptions, fetchTaskOptions, setTaskPage
} = useMindmapTasks()

const {
  historyStack, historyIndex, MAX_HISTORY_SIZE, isRestoringSnapshot,
  canUndo, canRedo, saveSnapshot: saveSnapshotFromComposable, logHistory
} = useMindmapHistory()

const {
  clipboard, hasClipboard, setClipboard, clearClipboard
} = useMindmapClipboard()

// Constants và variables cần giữ lại
const SAVE_DELAY = 1000
const TEXT_INPUT_SAVE_DELAY = 300
const TEXT_INPUT_SNAPSHOT_DELAY = 100 // Debounce time để lưu snapshot khi nhập text (dài hơn để tránh tạo quá nhiều snapshots)
const FORMATTING_SNAPSHOT_DELAY = 300 // Debounce time để lưu snapshot khi formatting (highlight, bold, italic, etc.)
let saveTimeout = null
let textInputSaveTimeout = null
let textInputSnapshotTimeout = null
let formattingSnapshotTimeout = null
let nodeFocusTimeouts = []
let nodeCounter = 0
let creationOrderCounter = 0
let d3Renderer = null
const nodeCreationOrder = ref(new Map())

// Setup Save operations composable (Phase 2)
const saveOperations = useMindmapSave({
  isSaving,
  savingCount,
  lastSaved,
  formatTime,
  changedNodeIds,
  SAVE_DELAY
})
const {
  saveNodeResource,
  deleteNodesResource,
  saveNodesBatchResource,
  broadcastEditingResource,
} = saveOperations

// ⚠️ NEW: Resource để cleanup tất cả editing states của user khi reload/đóng tab
const cleanupEditingResource = createResource({
  url: "drive.api.mindmap.cleanup_user_editing_states",
  method: "POST"
})

// Setup Toolbar composable (Phase 3)
const toolbarOperations = useMindmapToolbar({
  d3Renderer: () => d3Renderer,
  nodes,
  edges,
  nodeCreationOrder,
  saveSnapshot: saveSnapshot,
  scheduleSave: () => scheduleSave(),
})
const {
  handleToolbarDone,
  applyStrikethroughToTitle,
} = toolbarOperations

// Setup Comments composable (Phase 3)
const commentsOperations = useMindmapComments({
  activeCommentNode,
  showPanel,
  suppressPanelAutoFocus,
  d3Renderer: () => d3Renderer,
})
const {
  onCancelComment,
  handleHighlightNode: _handleHighlightNode,
  handleSelectCommentNode: _handleSelectCommentNode,
} = commentsOperations

// Setup Nodes composable (Phase 4)
const d3RendererRef = computed(() => d3Renderer)
const nodeOperations = useMindmapNodes({
  nodes,
  edges,
  elements,
  selectedNode,
  changedNodeIds,
  nodeCreationOrder,
  d3Renderer: d3RendererRef,
  permissions,
  generateNodeId: () => generateNodeId(),
  saveSnapshot: saveSnapshot,
  scheduleSave: () => scheduleSave(),
  saveImmediately: () => saveImmediately(),
  updateD3RendererWithDelay: (delay) => updateD3RendererWithDelay(delay)
})
const {
  addChildToNode,
  addSiblingToNode,
  countChildren,
  getChildren,
  getParent,
  getNodeSize,
  copyNode: copyNodeFromComposable,
  setCreationOrderCounter,
  scrollToNodeWithRetry,
  scrollToNodeVerticalWithRetry
} = nodeOperations

// Setup Keyboard composable (Phase 5)
const keyboardOperations = useMindmapKeyboard({
  selectedNode,
  editingNode,
  permissions,
  toolbarRef,
  d3Renderer: d3RendererRef,
  addChildToNode,
  addSiblingToNode,
  deleteSelectedNode: () => deleteSelectedNode(),
  undo: () => undo(),
  redo: () => redo(),
  handleToolbarDone,
  copyNode,
  cutNode,
  pasteToNode,
  pasteFromSystemClipboard,
  hasClipboard
})
const {
  handleKeyDown,
  handleCopy,
  handleCompositionStart,
  handleCompositionEnd
} = keyboardOperations

// Setup View Controls composable (Phase 8)
const viewControls = useMindmapViewControls({
  d3Renderer: d3RendererRef,
  nodes,
  edges,
  nodeCreationOrder
})
const {
  updateD3Renderer,
  updateD3RendererWithDelay,
  fitView,
  zoomIn,
  zoomOut
} = viewControls

// Setup Delete operations composable (Phase 9)
const deleteOperations = useMindmapDelete({
  nodes,
  edges,
  elements,
  selectedNode,
  nodeCreationOrder,
  changedNodeIds,
  permissions,
  d3Renderer: d3RendererRef,
  entityName: props.entityName,
  countChildren,
  saveSnapshot: saveSnapshot,
  updateD3Renderer: () => updateD3Renderer(),
  savingCount,
  deleteNodesResource
})
const {
  showDeleteDialog,
  deleteDialogType,
  childCount,
  showTaskLinkDragDialog,
  taskLinkDragNodeId,
  deleteSelectedNode,
  performDelete,
  closeDeleteDialog,
  confirmDelete,
  showTaskLinkDragWarning,
  closeTaskLinkDragDialog,
  confirmTaskLinkDrag
} = deleteOperations

// Setup Renderer Helpers composable (Phase 10)
const rendererHelpers = useMindmapRendererHelpers({
  d3Renderer: d3RendererRef,
  nodes,
  edges,
  elements
})
const {
  scrollToNodeFromHash,
  syncElementsWithRendererPosition
} = rendererHelpers

// Setup UI Actions composable (Phase 11)
const uiActions = useMindmapUIActions({
  store,
  mindmap,
  rename,
  entityName: props.entityName,
  nodes,
  edges,
  selectedNode,
  editingNode,
  showContextMenu,
  contextMenuNode,
  contextMenuPos,
  contextMenuCentered,
  showPanel,
  activeCommentNode,
  commentPanelRef,
  commentInputValue,
  isFromUI,
  d3Renderer: d3RendererRef,
  suppressPanelAutoFocus,
  textInputSaveTimeout: { value: textInputSaveTimeout },
  nodeFocusTimeouts: { value: nodeFocusTimeouts },
  hasClipboard,
  addChildToNode,
  addSiblingToNode,
  copyNode,
  cutNode,
  pasteToNode,
  pasteFromSystemClipboard,
  copyNodeLink,
  openTaskLinkModal: (node) => openTaskLinkModal(node),
  deleteTaskLink: (node) => deleteTaskLink(node),
  deleteSelectedNode,
  scrollToNodeWithRetry,
  scheduleSave: () => scheduleSave()
})
const {
  renameMindmapTitle,
  openCommentPanel,
  handleContextMenuAction,
  handleClickOutside
} = uiActions

// Setup Realtime Comment Handlers composable (Phase 12)
const realtimeComments = useMindmapRealtimeComments({
  nodes,
  edges,
  currentView,
  entityName: props.entityName,
  nodeCreationOrder,
  d3Renderer: d3RendererRef,
  applyStrikethroughToTitle
})
const {
  handleRealtimeNewComment,
  handleRealtimeDeleteOneComment,
  handleRealtimeResolvedComment,
  handleRealtimeUnresolvedComment,
  handleRealtimeTaskStatusUpdate
} = realtimeComments

// Setup Realtime Node Handlers composable (Phase 13)
const realtimeNodes = useMindmapRealtimeNodes({
  store,
  nodes,
  edges,
  elements,
  selectedNode,
  editingNode,
  nodeEditingUsers,
  nodeCreationOrder,
  isSaving,
  entityName: props.entityName,
  d3Renderer: d3RendererRef,
  editingStartTime,
  changedNodeIds,
  calculateNodeHeightWithImages,
  saveSnapshot: saveSnapshot,
  applyStrikethroughToTitle
})
const {
  handleRealtimeNodesDeleted,
  handleRealtimeNodeEditing,
  handleRealtimeNodesBatchUpdate,
  handleRealtimeNodeUpdate
} = realtimeNodes

const route = useRoute()

// Computed: Lấy editor instance từ selectedNode
const currentEditorInstance = computed(() => {
  if (!selectedNode.value || !d3Renderer) return null
  return d3Renderer.getEditorInstance(selectedNode.value.id)
})

// Helper wrappers cho các function từ helpers
const generateNodeId = () => generateNodeIdHelper(store.state.user?.id)
const extractTitleFromLabel = (label) => extractTitleHelper(label)
const resolveTaskLinkNode = (val) => resolveTaskLinkNodeHelper(val, nodes.value)

// ⚠️ FIX: Resource để lưu trạng thái collapse vào database
const saveCollapsedNodesResource = createResource({
  url: "drive.api.mindmap.save_mindmap_collapsed_nodes",
  method: "POST",
  auto: false,
})

// ⚠️ FIX: Lưu collapsed_nodes từ API response để dùng khi khởi tạo renderer
const collapsedNodesFromDB = ref([])

// ✅ Watch elements to ensure root node is NEVER deleted
watch(elements, (newElements) => {
  if (isRestoringSnapshot.value) {
    return
  }
  const nodesLocal = newElements.filter(el => el.id && !el.source && !el.target)
  const hasRoot = nodesLocal.some(el => el.id === 'root')

  if (!hasRoot && nodesLocal.length > 0) {
    const rootNode = {
      id: 'root',
      data: {
        label: mindmap.data?.title || 'Root',
        isRoot: true
      }
    }

    elements.value = [rootNode, ...newElements]
  }
}, { deep: true })

// API: Load mindmap
// Resources moved up before composables setup to avoid temporal dead zone

// Initialize mindmap with root node
initializeMindmap = async (data) => {
  // ⚠️ FIX: Reset flag khi import lại mindmap để có thể scale lại
  scaledNodesAfterImport.value.clear()
  
  if (data.mindmap_data && data.mindmap_data.nodes && data.mindmap_data.nodes.length > 0) {
    // Convert VueFlow format to D3 format
    const loadedNodes = data.mindmap_data.nodes.map(node =>

    ({
      id: node.id,
      data: node.data || { label: node.label || '' },
      position: node.position,
      count: node.count || 0,
      node_key: node.node_key ?? null, // thêm node_key và created_at để về sau còn look up history comment
      created_at: node.created_at ?? null,
    }))

    const loadedEdges = data.mindmap_data.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target
    }))

    elements.value = [...loadedNodes, ...loadedEdges]

    const maxId = Math.max(...loadedNodes.map(n => {
      const match = n.id.match(/node-(\d+)/)
      return match ? parseInt(match[1]) : 0
    }))
    nodeCounter = maxId + 1

    // ⚠️ CRITICAL: Store existing creation order từ node.data.order nếu có
    // Nếu không có order trong node.data, dùng index làm fallback
    loadedNodes.forEach((node, index) => {
      // Ưu tiên sử dụng order từ node.data.order nếu có
      const order = node.data?.order !== undefined ? node.data.order : index
      nodeCreationOrder.value.set(node.id, order)
    })
    // Tìm order lớn nhất để set creationOrderCounter
    const maxOrder = Math.max(...Array.from(nodeCreationOrder.value.values()), loadedNodes.length - 1)
    creationOrderCounter = maxOrder + 1

    
  } else {
    const rootNode = {
      id: 'root',
      data: {
        label: data.title,
        isRoot: true
      }
    }

    elements.value = [rootNode]
    nodeCounter = 1

    // Store root
    nodeCreationOrder.value.set('root', 0)
    creationOrderCounter = 1

    // ⚠️ CRITICAL: Đánh dấu root node cần save
    changedNodeIds.value.add('root')

    saveImmediately()
  }

  // Initialize D3 renderer
  await nextTick()
  if (currentView.value === 'visual') {
    initD3Renderer()
    // ⚠️ NOTE: restoreEditingIndicators sẽ được gọi trong onRenderComplete callback
  }
  
  // Lưu snapshot ban đầu sau khi khởi tạo mindmap (force = true vì đây là snapshot đầu tiên)
  await nextTick()
  saveSnapshot(true)
}

// ⚠️ NEW: Restore editing indicators từ nodeEditingUsers sau khi reload
const restoreEditingIndicators = () => {
  if (!d3Renderer || !d3Renderer.g) {
    console.log('[Editing] ⏸️ Renderer chưa sẵn sàng, bỏ qua restore editing indicators')
    return
  }
  
  const renderer = d3Renderer
  
  console.log('[Editing] 🔄 Restoring editing indicators for', nodeEditingUsers.value.size, 'nodes')
  
  nodeEditingUsers.value.forEach((editingUser, nodeId) => {
    const nodeGroup = renderer.g.select(`[data-node-id="${nodeId}"]`)
    if (!nodeGroup.empty()) {
      const rect = nodeGroup.select('.node-rect')
      if (!rect.empty()) {
        // Apply editing style
        rect
          .style('stroke', '#f59e0b')
          .style('stroke-width', '2px')
          .attr('stroke-dasharray', '4 2')
        
        // Add editing badge if not exists
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
            .text(`${editingUser.userName}`)
          
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
          
          console.log(`[Editing] ✅ Restored editing indicator for node ${nodeId} (${editingUser.userName})`)
        }
      }
    }
  })
  
  console.log('[Editing] ✅ Finished restoring editing indicators')
}

// Initialize D3 Renderer
const initD3Renderer = () => {
  if (currentView.value !== 'visual') {
    isRendering.value = false
    return
  }  
  if (!d3Container.value) return

  // Set loading state khi bắt đầu render
  isRendering.value = true

  d3Renderer = new D3MindmapRenderer(d3Container.value, {
    width: window.innerWidth,
    height: window.innerHeight - 84,
    nodeSpacing: 20,
    layerSpacing: 40,
    padding: 20,
    nodeCreationOrder: nodeCreationOrder,
    permissions: permissions.value
  })
  
  // ⚠️ FIX: Load trạng thái collapse từ database
  if (collapsedNodesFromDB.value && collapsedNodesFromDB.value.length > 0) {
    const collapsedNodeIds = collapsedNodesFromDB.value
    d3Renderer.collapsedNodes = new Set(collapsedNodeIds)
    console.log(`[Collapse] ✅ Restored ${collapsedNodeIds.length} collapsed nodes from database:`, collapsedNodeIds)
  }
  
  // Watch permissions để cập nhật khi quyền thay đổi
  watch(permissions, (newPermissions) => {
    if (d3Renderer) {
      d3Renderer.options.permissions = newPermissions
      // Re-render để cập nhật UI (ẩn/hiện nút add-child, disable/enable editor)
      d3Renderer.render(false)
    }
  }, { deep: true })

  // Lưu uploadImage function vào renderer để có thể dùng trong node editor
  d3Renderer.uploadImage = async (file) => {
    return await uploadImageToMindmap(file, props.team, props.entityName, mindmap.data?.is_private)
  }

  installMindmapContextMenu(d3Renderer)

  d3Renderer.setCallbacks({
    onNodeClick: (node, event) => {
      // Đóng context menu khi click vào node
      if (showContextMenu.value) {
        showContextMenu.value = false
      }
      
      if (event?.target?.closest?.('.comment-count-badge')) {
        
        return
      }
      if (node) {
        selectedNode.value = node
        d3Renderer.selectNode(node.id, false)
        
      } else {
        selectedNode.value = null
        d3Renderer.selectNode(null, true)
        
      }
    },
    onNodeDoubleClick: () => {
      /* Editing happens inline inside each node */
    },
    onNodeAdd: (parentId) => {
      addChildToNode(parentId)
    },
    onNodeUpdate: (nodeId, updates) => {
      // sửa lại để update sort dựa trên root/ position cho bên comment panel
      const node = nodes.value.find(n => n.id === nodeId)
      if (!node) return

      // Kiểm tra quyền write cho các thao tác edit và drag
      if (!permissions.value.write) {
        // Chặn edit label
        if (updates.label !== undefined) {
          toast.error("Bạn không có quyền chỉnh sửa node")
          return
        }
        // Chặn drag & drop
        if (updates.parentId !== undefined) {
          toast.error("Bạn không có quyền di chuyển node")
          return
        }
      }

      // 1. label
      if (updates.label !== undefined) {
        node.data.label = updates.label
        changedNodeIds.value.add(nodeId)
      }

      // 2. parentId (re-parent khi drag & drop)
      if (updates.parentId !== undefined) {
        console.log('🔄 [onNodeUpdate] parentId change detected:', {
          nodeId,
          oldParent: node.data?.parentId,
          newParent: updates.parentId,
          stackTrace: new Error().stack
        });
        
        // Validate: Không cho phép node thành con của chính nó
        if (nodeId === updates.parentId) {
          console.warn(`Cannot make node ${nodeId} a child of itself`)
          toast.error("Không thể di chuyển node thành con của chính nó")
          return
        }
        
        // Validate: Không cho phép tạo circular reference (node thành con của con của nó)
        const isDescendant = (potentialParent, checkNodeId) => {
          if (potentialParent === checkNodeId) return true
          const parentEdge = edges.value.find(e => e.target === potentialParent)
          if (!parentEdge) return false
          return isDescendant(parentEdge.source, checkNodeId)
        }
        
        if (isDescendant(updates.parentId, nodeId)) {
          console.warn(`Circular reference detected: ${nodeId} -> ${updates.parentId}`)
          toast.error("Không thể di chuyển node vào nhánh con của chính nó")
          return
        }
        
        // Check if parentId already matches (avoid duplicate save)
        if (node.data?.parentId === updates.parentId) {
          console.log('⏭️ [onNodeUpdate] ParentId unchanged, skipping save');
          return;
        }
        
        // Track parentId update để onNodeReorder biết skip save
        window.__lastParentIdUpdate = nodeId;
        window.__lastParentIdUpdateTime = Date.now();
        
        // Track node đang được save do parentId change để tránh duplicate save
        if (!window.__parentIdChangeSaving) {
          window.__parentIdChangeSaving = new Set();
        }
        window.__parentIdChangeSaving.add(nodeId);
        
        // Lưu snapshot trước khi thay đổi parent (drag & drop)
        saveSnapshot()
        
        // 🔴 QUAN TRỌNG: giữ data.parentId luôn sync với edges
        node.data = node.data || {}
        node.data.parentId = updates.parentId
        changedNodeIds.value.add(nodeId)

        // ⚠️ CRITICAL: Xóa edge cũ và tạo edge mới với parent mới
        // Phải xóa edge cũ vì ID thay đổi (edge-oldParent-node -> edge-newParent-node)
        const oldEdgeIndex = elements.value.findIndex(el => el.target === nodeId && el.source && el.target)
        if (oldEdgeIndex !== -1) {
          // Xóa edge cũ
          elements.value.splice(oldEdgeIndex, 1)
        }
        
        // Thêm edge mới với parent mới
        elements.value.push({
          id: `edge-${updates.parentId}-${nodeId}`,
          source: updates.parentId,
          target: nodeId,
        })

        // re-layout
        updateD3RendererWithDelay()
        
        // ⚠️ CRITICAL: Lưu ngay sau khi thay đổi parent (drag & drop)
        saveImmediately()
        
        // Clear flag sau khi saveImmediately xử lý xong (sau 500ms để đảm bảo save đã được trigger)
        // saveImmediately sẽ clear changedNodeIds sau khi save, nên flag cũng nên được clear
        setTimeout(() => {
          if (window.__parentIdChangeSaving) {
            window.__parentIdChangeSaving.delete(nodeId);
            console.log('🧹 [onNodeUpdate] Cleared parentIdChangeSaving flag for:', nodeId);
          }
        }, 500);
        
        return
      }

      // 3. skipSizeCalculation: chỉ lưu không tính lại size (formatting updates)
      if (updates.skipSizeCalculation) {
        console.log('skipSizeCalculation', updates)
        // ⚠️ FIX: Lưu snapshot với debounce cho formatting changes để tránh tạo nhiều snapshot
        // khi highlight hoặc format text (có thể trigger nhiều lần liên tiếp)
        if (formattingSnapshotTimeout) {
          clearTimeout(formattingSnapshotTimeout)
        }
        formattingSnapshotTimeout = setTimeout(() => {
          console.log(`[Formatting] 💾 Lưu snapshot sau khi format cho node ${nodeId}`)
          saveSnapshot()
          formattingSnapshotTimeout = null
        }, FORMATTING_SNAPSHOT_DELAY)
        scheduleSave()
        return
      }

      // 4. lưu mindmap (text content updates)
      // ⚠️ NEW: Auto-save sau 300ms khi nhập text, không cần click ra ngoài
      if (textInputSaveTimeout) {
        clearTimeout(textInputSaveTimeout)
      }
      textInputSaveTimeout = setTimeout(() => {
        scheduleSave()
        textInputSaveTimeout = null
      }, TEXT_INPUT_SAVE_DELAY)
      
      // ⚠️ FIX: Không lưu snapshot nếu đang upload ảnh (insert image trigger text input)
      if (window.__isUploadingImage && window.__uploadingImageNodeId === nodeId) {
        console.log('[TextInput] ⏭️ Bỏ qua lưu snapshot vì đang upload ảnh cho node:', nodeId)
        return
      }
      
      // ⚠️ FIX: Lưu snapshot với debounce khi nhập text để có thể undo từng bước
      // Debounce time dài hơn (1 giây) để tránh tạo quá nhiều snapshots
      if (textInputSnapshotTimeout) {
        clearTimeout(textInputSnapshotTimeout)
      }
      textInputSnapshotTimeout = setTimeout(() => {
        console.log(`[TextInput] 💾 Lưu snapshot sau khi nhập text cho node ${nodeId}`)
        saveSnapshot()
        textInputSnapshotTimeout = null
      }, TEXT_INPUT_SNAPSHOT_DELAY)
    },
    onNodeReorder: (nodeId, newOrder) => {
      // ⚠️ FIX: Lưu snapshot trước khi reorder
      saveSnapshot()
      
      // ⚠️ NEW: Cập nhật nodeCreationOrder khi reorder sibling
      nodeCreationOrder.value.set(nodeId, newOrder)
      
      // ⚠️ CRITICAL: Đánh dấu node đã thay đổi để save
      changedNodeIds.value.add(nodeId)
      
      // ⚠️ CRITICAL: Khi reorder node con trực tiếp của root, đánh dấu tất cả các node con trực tiếp của root
      // để đảm bảo position của tất cả được lưu (vì layout được tính toán lại)
      const node = nodes.value.find(n => n.id === nodeId)
      if (node) {
        const parentId = getParent(nodeId)
        // Nếu node là con trực tiếp của root
        if (parentId === 'root' || parentId === null) {
          // Tìm tất cả các node con trực tiếp của root
          const rootChildren = getChildren('root')
          // Đánh dấu tất cả để đảm bảo position được lưu
          rootChildren.forEach(childId => {
            changedNodeIds.value.add(childId)
          })
        }
      }

      // Cập nhật renderer với nodeCreationOrder mới
      if (d3Renderer) {
        d3Renderer.options.nodeCreationOrder = nodeCreationOrder.value
        // ⚠️ CRITICAL: Render và đợi renderer hoàn thành để đảm bảo positions được cập nhật
        d3Renderer.render().then(() => {
          // ⚠️ CRITICAL: Gọi scheduleSave sau khi render hoàn thành để lưu position
          // Đảm bảo position được lưu vào database khi di chuyển vị trí các node con trực tiếp của root
          // Đợi thêm một chút để đảm bảo positions đã được cập nhật vào d3Renderer.positions
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scheduleSave()
            })
          })
        })
      } else {
        // Nếu không có renderer, vẫn gọi scheduleSave
        scheduleSave()
      }
    },
    onNodeEditingStart: (nodeId) => {
      const editingUser = nodeEditingUsers.value.get(nodeId)
      if (editingUser) {
        // ⚠️ FIX: Chỉ hiển thị toast 1 lần mỗi 2 giây để tránh spam
        const now = Date.now()
        if (!window.__lastEditingToast) {
          window.__lastEditingToast = {}
        }
        const lastToast = window.__lastEditingToast[nodeId] || 0
        if (now - lastToast > 2000) {
          window.__lastEditingToast[nodeId] = now
          toast({
            title: `${editingUser.userName} đang chỉnh sửa node này`,
            text: "Vui lòng đợi họ hoàn thành",
            indicator: "orange",
            timeout: 3
          })
        }
        return false
      }
      
      // ⚠️ FIX: Không lưu snapshot nếu đang upload ảnh (blur/focus lại để update height)
      if (window.__isUploadingImage && window.__uploadingImageNodeId === nodeId) {
        console.log('[EditStart] ⏭️ Bỏ qua lưu snapshot vì đang upload ảnh cho node:', nodeId)
        editingNode.value = nodeId
        editingStartTime.value = Date.now()
        return true
      }
      
      // ⚠️ FIX: Không lưu snapshot nếu node vừa được tạo (< 2 giây)
      // Vì đã có snapshot khi tạo node rồi, không cần snapshot thêm trong EditStart
      const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer
      if (renderer?.newlyCreatedNodes) {
        const newlyCreatedTime = renderer.newlyCreatedNodes.get(nodeId)
        if (newlyCreatedTime) {
          const timeSinceCreation = Date.now() - newlyCreatedTime
          if (timeSinceCreation < 2000) {
            console.log('[EditStart] ⏭️ Bỏ qua lưu snapshot vì node vừa được tạo (< 2s):', nodeId, { timeSinceCreation })
            editingNode.value = nodeId
            editingStartTime.value = Date.now()
            broadcastNodeEditing(nodeId, true)
            return true
          }
        }
      }
      
      // ⚠️ CRITICAL: Lưu snapshot TRƯỚC khi bắt đầu edit
      // Đảm bảo có snapshot "before" để undo về
      // Force = true để đảm bảo luôn lưu snapshot, ngay cả khi so sánh thấy không có thay đổi
      // (vì node chưa được edit nên có thể so sánh thấy giống snapshot trước)
      console.log('[EditStart] 💾 Lưu snapshot trước khi bắt đầu edit node:', nodeId)
      saveSnapshot(true)
      
      editingNode.value = nodeId
      editingStartTime.value = Date.now()
      broadcastNodeEditing(nodeId, true)
      return true
    },
    onNodeEditingEnd: (nodeId) => {
      // Chỉ khi KẾT THÚC edit mới đổi tên file nếu là node root
      const finishedNodeId = nodeId || editingNode.value
      console.log(`[EditEnd] ✅ Kết thúc edit node: ${finishedNodeId}`)
      
      // ⚠️ FIX: Clear text input snapshot timeout khi blur để đảm bảo snapshot được lưu ngay
      if (textInputSnapshotTimeout) {
        clearTimeout(textInputSnapshotTimeout)
        textInputSnapshotTimeout = null
      }
      
      // ⚠️ FIX: Clear formatting snapshot timeout khi blur để đảm bảo snapshot được lưu ngay
      if (formattingSnapshotTimeout) {
        clearTimeout(formattingSnapshotTimeout)
        saveSnapshot()
        formattingSnapshotTimeout = null
      }
      
      // ⚠️ FIX: Không lưu snapshot nếu đang upload ảnh (blur để update height)
      if (window.__isUploadingImage && window.__uploadingImageNodeId === finishedNodeId) {
        console.log('[EditEnd] ⏭️ Bỏ qua lưu snapshot vì đang upload ảnh cho node:', finishedNodeId)
        // Không clear editingNode vì sẽ focus lại ngay
        return
      }
      
      if (finishedNodeId) {
        const node = nodes.value.find(n => n.id === finishedNodeId)
        if (node) {
          // node.data.label đã được cập nhật trong renderer on('blur')
          
          // ⚠️ FIX: Kiểm tra xem node có thay đổi nội dung không
          const hasChanges = changedNodeIds.value.has(finishedNodeId)
          
          // ⚠️ FIX: Kiểm tra xem node có thay đổi nội dung thực sự không
          // So sánh label hiện tại với label mặc định "Nhánh mới"
          // Lấy label từ editor nếu có, nếu không thì dùng node.data.label
          const renderer = typeof d3Renderer === 'function' ? d3Renderer() : d3Renderer?.value || d3Renderer
          let currentLabel = ''
          
          // ⚠️ FIX: Lấy label từ editor để đảm bảo chính xác
          const editorInstance = renderer?.getEditorInstance?.(finishedNodeId)
          if (editorInstance && !editorInstance.isDestroyed) {
            try {
              const editorLabel = editorInstance.getHTML()
              // Extract plain text từ HTML để so sánh
              const tempDiv = document.createElement('div')
              tempDiv.innerHTML = editorLabel
              const plainText = (tempDiv.textContent || tempDiv.innerText || '').trim()
              currentLabel = plainText
            } catch (err) {
              // Nếu có lỗi, dùng label từ node.data
              const nodeLabel = node.data?.label || ''
              if (nodeLabel) {
                const tempDiv = document.createElement('div')
                tempDiv.innerHTML = nodeLabel
                currentLabel = (tempDiv.textContent || tempDiv.innerText || '').trim()
              }
            }
          } else {
            // Không có editor, dùng label từ node.data
            const nodeLabel = node.data?.label || ''
            if (nodeLabel) {
              const tempDiv = document.createElement('div')
              tempDiv.innerHTML = nodeLabel
              currentLabel = (tempDiv.textContent || tempDiv.innerText || '').trim()
            }
          }
          
          const defaultLabel = 'Nhánh mới'
          // ⚠️ FIX: Coi là có thay đổi nếu label khác với defaultLabel (kể cả rỗng)
          const hasContentChanged = currentLabel !== defaultLabel
          
          // ⚠️ DEBUG: Log để kiểm tra
          console.log('[EditEnd] 🔍 Kiểm tra có nên lưu snapshot:', {
            nodeId: finishedNodeId,
            currentLabel,
            defaultLabel,
            hasContentChanged,
            hasNewlyCreatedNodes: !!renderer?.newlyCreatedNodes,
            newlyCreatedNodesKeys: renderer?.newlyCreatedNodes ? Array.from(renderer.newlyCreatedNodes.keys()) : []
          })
          
          // ⚠️ FIX: Không lưu snapshot nếu node vừa được tạo và chưa có thay đổi nội dung
          // Vì đã có snapshot khi tạo node rồi, không cần snapshot thêm khi blur
          if (renderer?.newlyCreatedNodes && !hasContentChanged) {
            const newlyCreatedTime = renderer.newlyCreatedNodes.get(finishedNodeId)
            console.log('[EditEnd] 🔍 Kiểm tra newlyCreatedTime:', { newlyCreatedTime, nodeId: finishedNodeId })
            if (newlyCreatedTime) {
              const timeSinceCreation = Date.now() - newlyCreatedTime
              // ⚠️ FIX: Tăng thời gian kiểm tra lên 5 giây để đảm bảo bắt được blur ngay sau khi tạo
              if (timeSinceCreation < 5000) {
                console.log('[EditEnd] ⏭️ Bỏ qua lưu snapshot vì node vừa được tạo và chưa có thay đổi nội dung:', finishedNodeId, { timeSinceCreation, currentLabel, defaultLabel, hasContentChanged })
                // ⚠️ FIX: Xóa node khỏi newlyCreatedNodes sau khi đã kiểm tra xong
                if (renderer.newlyCreatedNodes) {
                  renderer.newlyCreatedNodes.delete(finishedNodeId)
                }
                // Vẫn xử lý các logic khác (rename root node, save, etc.)
              } else {
                // Node đã được tạo > 5s, lưu snapshot bình thường
                console.log(`[EditEnd] 💾 Lưu snapshot sau khi blur node ${finishedNodeId} (node đã được tạo > 5s)`)
                saveSnapshot()
              }
            } else {
              // Node không phải là node mới, lưu snapshot bình thường
              console.log(`[EditEnd] 💾 Lưu snapshot sau khi blur node ${finishedNodeId} (không tìm thấy trong newlyCreatedNodes)`)
              saveSnapshot()
            }
          } else {
            // Node có thay đổi nội dung hoặc không phải node mới, lưu snapshot
            console.log(`[EditEnd] 💾 Lưu snapshot sau khi blur node ${finishedNodeId}`, { 
              hasContentChanged, 
              currentLabel, 
              defaultLabel,
              hasNewlyCreatedNodes: !!renderer?.newlyCreatedNodes
            })
            saveSnapshot()
          }

          // Nếu là root node, đổi tên file
          if (node.id === 'root' || node.data?.isRoot) {
            const originalLabel = (node.data?.label || '').trim()
            let newTitle = extractTitleFromLabel(originalLabel)

            // Nếu xóa hết text, dùng tên mặc định
            if (!newTitle) {
              newTitle = "Sơ đồ"
              // Cập nhật label với tên mặc định
              node.data.label = newTitle
            }

            // Title giờ là Text, không cần cắt nữa - dùng trực tiếp newTitle để rename
            renameMindmapTitle(newTitle)
          }

          // Lưu ngay lập tức nếu có thay đổi (không đợi debounce)
          // hasChanges đã được khai báo ở trên
          if (hasChanges) {
            if (saveTimeout) {
              clearTimeout(saveTimeout)
              saveTimeout = null
            }
            saveImmediately()
          }
        }
      }

      broadcastNodeEditing(finishedNodeId, false)
      
      // Clear editingNode và editingStartTime
      editingNode.value = null
      editingStartTime.value = null

      // Update layout sau khi edit xong để đảm bảo node size chính xác
      // Tăng delay lên 300ms để đảm bảo DOM đã update và node size đã được tính toán lại
      // Đặc biệt quan trọng khi edit node giữa có nhiều node con
      updateD3RendererWithDelay(300)
    },
    onNodeHover: (nodeId, isHovering) => {
      hoveredNode.value = isHovering ? nodeId : null
    },
    onNodeCollapse: (nodeId, isCollapsed) => {
      // Re-render sẽ được xử lý trong renderer
      updateD3Renderer()
      
      // ⚠️ FIX: Lưu trạng thái collapse vào database và emit realtime event
      if (d3Renderer) {
        const collapsedNodeIds = Array.from(d3Renderer.collapsedNodes)
        // Cập nhật ref để đồng bộ
        collapsedNodesFromDB.value = collapsedNodeIds
        
        saveCollapsedNodesResource.submit({
          entity_name: props.entityName,
          collapsed_node_ids: collapsedNodeIds
        }).then(() => {
          console.log(`[Collapse] ✅ Saved ${collapsedNodeIds.length} collapsed nodes to database`)
        }).catch((error) => {
          console.error('[Collapse] ❌ Error saving collapsed nodes to database:', error)
        })
      }
      
      // ⚠️ FIX: Nếu collapse node, scroll theo chiều dọc đến node cha sau khi render xong
      if (isCollapsed) {
        // Đợi render xong rồi mới scroll
        nextTick(() => {
          setTimeout(() => {
            if (d3Renderer && nodeId) {
              // Scroll theo chiều dọc đến node cha vừa được collapse (không căn giữa)
              scrollToNodeVerticalWithRetry(nodeId, 15, 150)
            }
          }, 300) // Delay để đảm bảo render đã hoàn tất
        })
      }
    },
    onRenderComplete: () => {
      // ⚠️ NEW: Scroll to node from hash sau khi render hoàn tất
      scrollToNodeFromHash()
      // Dừng loading khi render xong
      isRendering.value = false
      isMindmapReady.value = true
      
      // ⚠️ NEW: Restore editing indicators sau khi render hoàn tất
      nextTick(() => {
        restoreEditingIndicators()
      })
      
      // ⚠️ NEW: Apply/remove strikethrough cho tất cả nodes dựa trên completed status
      // Cần apply cho cả completed = true (add) và completed = false (remove)
      nextTick(() => {
        setTimeout(() => {
          nodes.value.forEach(node => {
            if (node.id !== 'root') {
              const editorInstance = d3Renderer?.getEditorInstance?.(node.id)
              if (editorInstance) {
                const isCompleted = node.data?.completed || false
                applyStrikethroughToTitle(editorInstance, isCompleted)
              }
            }
          })
        }, 200) // Delay để đảm bảo editor đã sẵn sàng
      })
      
      // ⚠️ FIX: Đợi ảnh load xong và scale node giống như khi insert image
      // Chỉ scale một lần khi import (tránh loop)
      if (scaledNodesAfterImport.value.size === 0) {
        nextTick(() => {
          setTimeout(() => {
            if (!d3Renderer) return
            
            nodes.value.forEach(node => {
              if (node.id === 'root') return
              
              // ⚠️ FIX: Chỉ scale node chưa được scale
              if (scaledNodesAfterImport.value.has(node.id)) return
              
              const hasImages = node.data?.label?.includes('<img') || node.data?.label?.includes('image-wrapper')
              if (!hasImages) return
              
              const editorInstance = d3Renderer.getEditorInstance?.(node.id)
              if (!editorInstance) return
              
              const editorDOM = editorInstance.view?.dom
              const editorContent = editorDOM?.querySelector('.mindmap-editor-prose') || editorDOM
              if (!editorContent) return
              
              // Tìm tất cả ảnh trong node
              const images = editorContent.querySelectorAll('img')
              if (images.length === 0) return
              
              // ⚠️ FIX: Đánh dấu node đang được scale để tránh scale lại
              scaledNodesAfterImport.value.add(node.id)
              
              // Kiểm tra xem ảnh đã load chưa
              const allImagesLoaded = Array.from(images).every(img => img.complete && img.naturalHeight > 0)
              
              if (allImagesLoaded) {
                // Ảnh đã load, trigger blur ngay để scale node
                setTimeout(() => {
                  scaleNodeAfterImageLoad(node.id, editorInstance, editorContent)
                }, 100)
              } else {
                // Đợi ảnh load xong
                const imageLoadPromises = Array.from(images)
                  .filter(img => !img.complete || img.naturalHeight === 0)
                  .map(img => new Promise((resolve) => {
                    if (img.complete && img.naturalHeight > 0) {
                      resolve()
                    } else {
                      img.addEventListener('load', resolve, { once: true })
                      img.addEventListener('error', resolve, { once: true })
                      // Timeout sau 3 giây để không block quá lâu
                      setTimeout(() => resolve(), 3000)
                    }
                  }))
                
                Promise.all(imageLoadPromises).then(() => {
                  setTimeout(() => {
                    scaleNodeAfterImageLoad(node.id, editorInstance, editorContent)
                  }, 150)
                })
              }
            })
          }, 500) // Delay để đảm bảo DOM đã sẵn sàng
        })
      }
    },
    onNodeContextMenu: (node, pos) => {
      contextMenuNode.value = node
      contextMenuPos.value = pos
      contextMenuCentered.value = false // Context menu từ node không dùng center
      showContextMenu.value = true
    },
    onOpenCommentList: handleContextMenuAction,
    onTaskLinkDragConfirm: async (nodeId) => {
      // Hiển thị dialog và trả về kết quả (true nếu user xác nhận, false nếu hủy)
      return await showTaskLinkDragWarning(nodeId)
    },
  })

  updateD3Renderer()
}

// ⚠️ FIX: Scale node sau khi ảnh load xong (giống như insert image)
function scaleNodeAfterImageLoad(nodeId, editorInstance, editorContent) {
  if (!d3Renderer || !nodeId || !editorInstance) return
  
  // ⚠️ FIX: Kiểm tra xem node đã được scale chưa để tránh loop
  if (scaledNodesAfterImport.value.has(nodeId + '_scaled')) {
    return
  }
  
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) return
  
  const isRootNode = node.data?.isRoot || node.id === 'root'
  if (isRootNode) return
  
  try {
    const nodeGroup = d3Renderer.g?.select(`[data-node-id="${nodeId}"]`)
    if (nodeGroup.empty()) return
    
    const foElement = nodeGroup.select('.node-text').node()
    if (!foElement) return
    
    // ⚠️ FIX: Đánh dấu node đã được scale để tránh scale lại
    scaledNodesAfterImport.value.add(nodeId + '_scaled')
    
    // ⚠️ CRITICAL: Xóa fixedWidth/fixedHeight để node có thể tự resize
    if (node.data) {
      delete node.data.fixedWidth
      delete node.data.fixedHeight
    }
    
    // Xóa cache để buộc tính toán lại
    if (d3Renderer.nodeSizeCache) {
      d3Renderer.nodeSizeCache.delete(nodeId)
    }
    
    // ⚠️ CRITICAL: Gọi trực tiếp handleEditorBlur để tính toán lại height
    // handleEditorBlur sẽ đo lại height từ DOM và cập nhật node size (giống như insert image)
    changedNodeIds.value.add(nodeId)
    
    try {
      d3Renderer.handleEditorBlur(nodeId, foElement, node)
      
      // ⚠️ FIX: Đợi handleEditorBlur hoàn tất, sau đó update renderer
      setTimeout(() => {
        changedNodeIds.value.add(nodeId)
        // ⚠️ FIX: Chỉ update renderer một lần, không focus lại để tránh trigger render lại
        updateD3RendererWithDelay(0)
      }, 200)
      
      console.log(`[Import] ✅ Đã scale node ${nodeId} sau khi ảnh load xong`)
    } catch (err) {
      console.error(`[Import] ❌ Lỗi khi gọi handleEditorBlur cho node ${nodeId}:`, err)
      // Fallback: gọi updateNodeHeight từ Vue component
      const vueAppEntry = d3Renderer?.vueApps?.get(nodeId)
      if (vueAppEntry?.instance && typeof vueAppEntry.instance.updateNodeHeight === 'function') {
        vueAppEntry.instance.updateNodeHeight()
      }
      // Vẫn update renderer nếu có lỗi
      updateD3RendererWithDelay(0)
    }
  } catch (err) {
    console.error(`[Import] ❌ Lỗi khi scale node ${nodeId}:`, err)
    // ⚠️ FIX: Xóa flag nếu có lỗi để có thể thử lại
    scaledNodesAfterImport.value.delete(nodeId + '_scaled')
  }
}

// Rename function moved to useMindmapUIActions composable

// Delete operations moved to useMindmapDelete composable

// ===== Undo/Redo System =====
// Lưu snapshot của state hiện tại (chỉ khi có thay đổi)
function saveSnapshot(force = false) {
  const caller = new Error().stack.split('\n')[2].trim()
  
  // ⚠️ FIX: Khi force = true, luôn lưu snapshot bất kể có thay đổi hay không
  if (force) {
    console.log('[Undo/Redo] 🔨 Force save snapshot (bỏ qua kiểm tra thay đổi)', {
      force: force,
      historyStackLength: historyStack.value.length,
      historyIndex: historyIndex.value
    })
    console.log('  Gọi từ:', caller)
    // Tiếp tục để lưu snapshot - KHÔNG return ở đây
  } else {
  // So sánh với snapshot trước đó để chỉ lưu khi có thay đổi
    if (historyStack.value.length > 0 && historyIndex.value >= 0) {
    const lastSnapshot = historyStack.value[historyIndex.value]
    const currentElements = JSON.stringify(elements.value)
    const lastElements = JSON.stringify(lastSnapshot.elements)
    
    // So sánh elements và nodeCreationOrder
    const currentOrder = JSON.stringify(Array.from(nodeCreationOrder.value.entries()))
    const lastOrder = JSON.stringify(Array.from(lastSnapshot.nodeCreationOrder.entries()))
    
    if (currentElements === lastElements && currentOrder === lastOrder) {
      // Không có thay đổi, không lưu snapshot
        console.log('[Undo/Redo] ⏭️ Không có thay đổi, bỏ qua lưu snapshot', {
          force: force,
          historyStackLength: historyStack.value.length,
          historyIndex: historyIndex.value
        })
      console.log('  Gọi từ:', caller)
      return
      }
    }
  }
  
  // ⚠️ FIX: Lưu kích thước node vào snapshot để có thể khôi phục sau khi undo/redo
  const elementsWithSizes = JSON.parse(JSON.stringify(elements.value))
  if (d3Renderer && d3Renderer.nodeSizeCache) {
    elementsWithSizes.forEach(element => {
      // Chỉ lưu kích thước cho nodes (không phải edges)
      if (element.id && !element.source && !element.target) {
        const cachedSize = d3Renderer.nodeSizeCache.get(element.id)
        if (cachedSize) {
          // Lưu kích thước vào node.data.rect để có thể khôi phục sau
          if (!element.data) element.data = {}
          element.data.rect = { width: cachedSize.width, height: cachedSize.height }
        } else {
          // Nếu không có cache, lấy từ DOM
          const nodeGroup = d3Renderer.g?.select(`[data-node-id="${element.id}"]`)
          if (nodeGroup && !nodeGroup.empty()) {
            const rect = nodeGroup.select('.node-rect')
            const rectWidth = parseFloat(rect.attr('width'))
            const rectHeight = parseFloat(rect.attr('height'))
            if (rectWidth && rectHeight) {
              if (!element.data) element.data = {}
              element.data.rect = { width: rectWidth, height: rectHeight }
            }
          }
        }
        
        // ⚠️ CRITICAL: Lấy label từ editor.getHTML() nếu có editor instance để tránh lỗi dấu tiếng Việt
        // Editor.getHTML() luôn trả về text đúng, còn node.data.label có thể bị corrupt từ realtime update
        if (d3Renderer && d3Renderer.getEditorInstance) {
          const editorInstance = d3Renderer.getEditorInstance(element.id)
          if (editorInstance && !editorInstance.isDestroyed && editorInstance.getHTML) {
            const editorLabel = editorInstance.getHTML()
            // Chỉ dùng editorLabel nếu nó có giá trị và không rỗng
            if (editorLabel && editorLabel.trim() !== '' && editorLabel !== '<p></p>' && editorLabel !== '<p data-type="node-title"></p>') {
              // ⚠️ FIX: Normalize Unicode để tránh lỗi dấu tiếng Việt
              const normalizedLabel = editorLabel && typeof editorLabel === 'string' 
                ? editorLabel.normalize('NFC') 
                : editorLabel
              if (!element.data) element.data = {}
              element.data.label = normalizedLabel
              // console.log(`[Undo/Redo] 📝 Lấy label từ editor.getHTML() cho node ${element.id} khi lưu snapshot:`, {
              //   editorLabelLength: normalizedLabel.length,
              //   editorLabelPreview: normalizedLabel.substring(0, 100),
              //   originalLabelLength: element.data?.label?.length || 0
              // })
            } else {
              // Editor có nhưng content rỗng, normalize label hiện tại nếu có
              if (element.data?.label && typeof element.data.label === 'string') {
                element.data.label = element.data.label.normalize('NFC')
              }
            }
          } else {
            // Không có editor instance, normalize label hiện tại nếu có
            if (element.data?.label && typeof element.data.label === 'string') {
              element.data.label = element.data.label.normalize('NFC')
            }
          }
        } else {
          // Không có d3Renderer hoặc getEditorInstance, normalize label hiện tại nếu có
          if (element.data?.label && typeof element.data.label === 'string') {
            element.data.label = element.data.label.normalize('NFC')
          }
        }
      }
    })
  }
  
  const snapshot = {
    elements: elementsWithSizes,
    nodeCreationOrder: new Map(nodeCreationOrder.value),
    selectedNodeId: selectedNode.value?.id || null,
    timestamp: Date.now()
  }
  
  // Log snapshot để debug
  const nodesInSnapshot = snapshot.elements.filter(el => el.id && !el.source && !el.target)
  const nodeIds = nodesInSnapshot.map(n => n.id)
  
  console.log('[Undo/Redo] 💾 Đang lưu snapshot:', {
    timestamp: new Date(snapshot.timestamp).toLocaleTimeString('vi-VN'),
    nodesCount: nodesInSnapshot.length,
    nodeIds: nodeIds,
    selectedNodeId: snapshot.selectedNodeId,
    stackTrước: `${historyStack.value.length} snapshots, index: ${historyIndex.value}`
  })
  console.log('  Gọi từ:', caller)
  
  // Xóa các snapshot sau vị trí hiện tại (khi có thao tác mới sau khi undo)
  if (historyIndex.value < historyStack.value.length - 1) {
    const removedCount = historyStack.value.length - historyIndex.value - 1
    historyStack.value = historyStack.value.slice(0, historyIndex.value + 1)
    console.log(`[Undo/Redo] 🗑️ Xóa ${removedCount} snapshot(s) sau vị trí hiện tại`)
  }
  
  // Thêm snapshot mới
  historyStack.value.push(snapshot)
  historyIndex.value = historyStack.value.length - 1
  
  // Giới hạn kích thước history
  if (historyStack.value.length > MAX_HISTORY_SIZE) {
    const removed = historyStack.value.shift()
    historyIndex.value = historyStack.value.length - 1
    console.log(`[Undo/Redo] ⚠️ Đã đạt giới hạn ${MAX_HISTORY_SIZE} snapshots, xóa snapshot cũ nhất`)
  }
  
  // console.log(`[Undo/Redo] ✅ Đã lưu snapshot #${historyIndex.value + 1}. Stack: ${historyStack.value.length} snapshots, index: ${historyIndex.value}`)
  
  // Log toàn bộ lịch sử
  logHistoryStack()
}

// Log toàn bộ lịch sử snapshot
const logHistoryStack = () => {
  // console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  // console.log('📚 LỊCH SỬ SNAPSHOT:')
  // console.log(`Tổng số: ${historyStack.value.length} snapshots`)
  // console.log(`Vị trí hiện tại: index ${historyIndex.value} (snapshot #${historyIndex.value + 1})`)
  // console.log(`Có thể undo: ${canUndo.value}, Có thể redo: ${canRedo.value}`)
  // console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  
  historyStack.value.forEach((snapshot, index) => {
    const nodesInSnapshot = snapshot.elements.filter(el => el.id && !el.source && !el.target)
    const nodeIds = nodesInSnapshot.map(n => n.id)
    const isCurrent = index === historyIndex.value
    
    console.log(`${isCurrent ? '👉' : '  '} #${index + 1}`, {
      timestamp: new Date(snapshot.timestamp).toLocaleTimeString('vi-VN'),
      nodesCount: nodesInSnapshot.length,
      nodeIds: nodeIds,
      selectedNode: snapshot.selectedNodeId,
      status: isCurrent ? '← HIỆN TẠI' : ''
    })
    
    // Hiển thị so sánh với snapshot trước nếu có
    if (index > 0) {
      const prevSnapshot = historyStack.value[index - 1]
      const prevNodes = prevSnapshot.elements.filter(el => el.id && !el.source && !el.target)
      const prevNodeIds = new Set(prevNodes.map(n => n.id))
      const currentNodeIds = new Set(nodeIds)
      
      const added = nodeIds.filter(id => !prevNodeIds.has(id))
      const removed = prevNodes.filter(n => !currentNodeIds.has(n.id)).map(n => n.id)
      
      if (added.length > 0 || removed.length > 0) {
        console.log(`    📊 So với #${index}:`, {
          added: added.length > 0 ? added : undefined,
          removed: removed.length > 0 ? removed : undefined
        })
      } else {
        console.log(`    📊 So với #${index}: Chỉ thay đổi nội dung (không thêm/xóa node)`)
      }
    }
  })
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

// ⚠️ FIX: Track network status để ngăn undo/redo khi mất kết nối
const isOnline = ref(navigator.onLine)

// Undo: Khôi phục state trước đó
const undo = () => {
  console.log('[Undo/Redo] ⏪ Undo được gọi:', {
    historyStackLength: historyStack.value.length,
    currentIndex: historyIndex.value,
    canUndo: canUndo.value,
    isOnline: isOnline.value
  })
  
  // ⚠️ FIX: Kiểm tra kết nối mạng trước khi undo
  if (!isOnline.value) {
    console.log('[Undo/Redo] ❌ Không thể undo: Mất kết nối mạng')
    toast({
      title: "Mất kết nối",
      text: "Mất kết nối. Vui lòng thử lại sau",
      icon: "x",
      iconClasses: "text-red-600",
      background: "bg-surface-red-2",
      position: "bottom-right",
      timeout: 5,
    })
    return
  }
  
  // Kiểm tra có history không
  if (historyStack.value.length === 0 || historyIndex.value < 0) {
    console.log('[Undo/Redo] ❌ Không có history để undo')
    return
  }
  
  // ⚠️ FIX: Kiểm tra có thể undo không
  // Cần có ít nhất 2 snapshots và đang không ở snapshot đầu tiên
  // canUndo được tính là historyIndex.value > 0 (từ useMindmapHistory)
  if (!canUndo.value) {
    console.log('[Undo/Redo] ❌ Không thể undo:', {
      historyStackLength: historyStack.value.length,
      currentIndex: historyIndex.value,
      canUndo: canUndo.value,
      reason: historyIndex.value === 0 ? 'Đã ở snapshot đầu tiên' : 'Không có snapshot trước đó'
    })
    return
  }
  
  // Di chuyển về snapshot trước
  historyIndex.value--
  const snapshot = historyStack.value[historyIndex.value]
  
  if (!snapshot) {
    console.error('[Undo/Redo] ❌ Không tìm thấy snapshot tại index:', historyIndex.value)
    // Khôi phục lại index
    historyIndex.value++
    return
  }
  
  console.log('[Undo/Redo] 📖 Khôi phục snapshot:', {
    index: historyIndex.value,
    timestamp: new Date(snapshot.timestamp).toLocaleTimeString('vi-VN'),
    nodesCount: snapshot.elements.filter(el => el.id && !el.source && !el.target).length,
    selectedNodeId: snapshot.selectedNodeId
  })
  
  // Khôi phục state
  restoreSnapshot(snapshot)
  
  // Log lịch sử sau khi undo
  logHistoryStack()
}

// Redo: Khôi phục state tiếp theo
const redo = () => {
  console.log('[Undo/Redo] ⏩ Redo được gọi:', {
    historyStackLength: historyStack.value.length,
    currentIndex: historyIndex.value,
    canRedo: historyIndex.value < historyStack.value.length - 1,
    isOnline: isOnline.value
  })
  
  // ⚠️ FIX: Kiểm tra kết nối mạng trước khi redo
  if (!isOnline.value) {
    console.log('[Undo/Redo] ❌ Không thể redo: Mất kết nối mạng')
    toast({
      title: "Mất kết nối",
      text: "Mất kết nối. Vui lòng thử lại sau",
      icon: "x",
      iconClasses: "text-red-600",
      background: "bg-surface-red-2",
      position: "bottom-right",
      timeout: 5,
    })
    return
  }
  
  if (historyIndex.value >= historyStack.value.length - 1) {
    console.log('[Undo/Redo] ❌ Không có history để redo')
    return
  }
  
  // Di chuyển đến snapshot tiếp theo
  historyIndex.value++
  const snapshot = historyStack.value[historyIndex.value]
  
  console.log('[Undo/Redo] 📖 Khôi phục snapshot:', {
    index: historyIndex.value,
    timestamp: new Date(snapshot.timestamp).toLocaleTimeString('vi-VN'),
    nodesCount: snapshot.elements.filter(el => el.id && !el.source && !el.target).length,
    selectedNodeId: snapshot.selectedNodeId
  })
  
  // Khôi phục state
  restoreSnapshot(snapshot)
  
  // Log lịch sử sau khi redo
  logHistoryStack()
}

// Khôi phục state từ snapshot
const restoreSnapshot = async (snapshot) => {
  if (!snapshot) {
    console.log('[Undo/Redo] ❌ restoreSnapshot: snapshot không tồn tại')
    return
  }
  
  // Lưu lại nodes hiện tại để so sánh (trước khi restore)
  const oldNodesMap = new Map()
  nodes.value.forEach(node => {
    oldNodesMap.set(node.id, node)
  })
  
  // ⚠️ Lấy lại nodes từ JSON snapshot (khai báo ngoài try để dùng sau)
  const restoredElements = JSON.parse(JSON.stringify(snapshot.elements))
  const restoredNodes = restoredElements.filter(el => el.id && !el.source && !el.target)
  
  isRestoringSnapshot.value = true
  
  try {
    console.log('[Undo/Redo] 🔄 Bắt đầu restore snapshot:', {
      timestamp: new Date(snapshot.timestamp).toLocaleTimeString('vi-VN'),
      elementsCount: snapshot.elements.length
    })
    
    console.log('[Undo/Redo] 📦 Nodes được khôi phục:', {
      nodesCount: restoredNodes.length
    })
    
    // ⚠️ FIX: Set fixedWidth và fixedHeight vào elements TRƯỚC KHI gán vào elements.value
    // Điều này đảm bảo khi setData() được gọi, d3Renderer.nodes sẽ có fixedWidth/fixedHeight
    restoredNodes.forEach(node => {
      if (node.data?.rect) {
        if (!node.data) node.data = {}
        node.data.fixedWidth = node.data.rect.width
        node.data.fixedHeight = node.data.rect.height
        // console.log(`[Undo/Redo] 🔧 Set fixedWidth/fixedHeight vào restoredElements cho node ${node.id}: ${node.data.rect.width}x${node.data.rect.height}`)
      }
    })
    
    // Khôi phục elements
    elements.value = restoredElements
    
    // Khôi phục nodeCreationOrder
    nodeCreationOrder.value = new Map(snapshot.nodeCreationOrder)
    
    // ⚠️ FIX: Sau undo/redo, KHÔNG focus vào node nào cả
    selectedNode.value = null
    if (d3Renderer) {
      d3Renderer.selectedNode = null
    }
    
    // Update renderer
    await nextTick()
    if (d3Renderer) {
      d3Renderer.options.nodeCreationOrder = nodeCreationOrder.value
      
      // ⚠️ FIX: Khôi phục kích thước node từ snapshot vào nodeSizeCache và node.data TRƯỚC KHI render
      // Điều này đảm bảo node giữ được kích thước ban đầu thay vì bị reset về mặc định
      if (d3Renderer && d3Renderer.nodeSizeCache) {
        restoredNodes.forEach(node => {
          if (node.data?.rect) {
            // Khôi phục kích thước từ snapshot vào cache
            d3Renderer.nodeSizeCache.set(node.id, {
              width: node.data.rect.width,
              height: node.data.rect.height
            })
            
            // ⚠️ CRITICAL: Set fixedWidth và fixedHeight vào node.data để nodeRendering.js dùng chúng
            // Thay vì tính toán lại width dựa trên nội dung
            if (!node.data) node.data = {}
            node.data.fixedWidth = node.data.rect.width
            node.data.fixedHeight = node.data.rect.height
            
            // ⚠️ CRITICAL: Cũng set vào d3Renderer.nodes để đảm bảo nodeRendering.js nhận được
            const d3Node = d3Renderer.nodes.find(n => n.id === node.id)
            if (d3Node) {
              if (!d3Node.data) d3Node.data = {}
              d3Node.data.fixedWidth = node.data.rect.width
              d3Node.data.fixedHeight = node.data.rect.height
            }
            
            console.log(`[Undo/Redo] 📐 Khôi phục kích thước cho node ${node.id}: ${node.data.rect.width}x${node.data.rect.height} (đã set fixedWidth/fixedHeight vào node.data và d3Renderer.nodes)`)
          }
        })
      }
      
      // ⚠️ OPTIMIZATION: So sánh snapshot để chỉ unmount các node thay đổi
      // Tìm các node đã thay đổi (thêm, xóa, hoặc thay đổi nội dung)
      const previousNodes = new Map()
      d3Renderer.nodes.forEach(node => {
        previousNodes.set(node.id, node)
      })
      
      const changedNodeIds = new Set()
      const newNodes = new Map()
      nodes.value.forEach(node => {
        newNodes.set(node.id, node)
        const prevNode = previousNodes.get(node.id)
        if (!prevNode) {
          // Node mới được thêm
          changedNodeIds.add(node.id)
        } else if (prevNode.data?.label !== node.data?.label) {
          // Node đã thay đổi nội dung
          changedNodeIds.add(node.id)
        }
      })
      
      // Tìm các node đã bị xóa
      previousNodes.forEach((node, id) => {
        if (!newNodes.has(id)) {
          changedNodeIds.add(id)
        }
      })
      
      // ⚠️ FIX: Áp dụng logic giống realtime update
      console.log('[Undo/Redo] 🔄 Clear cache và prepare cho', changedNodeIds.size, 'nodes bị thay đổi')
      
      // Step 1: Clear cache và xóa fixedWidth/Height cho nodes bị thay đổi (giống realtime)
      // ⚠️ FIX: KHÔNG xóa cache và fixedWidth/fixedHeight cho các node được khôi phục từ snapshot
      // Vì chúng ta đã khôi phục kích thước vào cache và node.data ở trên, không nên xóa
      changedNodeIds.forEach(nodeId => {
        if (nodeId !== 'root') {
          // ⚠️ FIX: Chỉ xóa cache và fixedWidth/fixedHeight nếu node không có kích thước trong snapshot
          // Nếu node có kích thước trong snapshot, giữ nguyên cache và fixedWidth/fixedHeight đã khôi phục
          const restoredNode = restoredNodes.find(n => n.id === nodeId)
          if (!restoredNode?.data?.rect) {
            // Node không có kích thước trong snapshot, xóa cache để tính toán lại
            if (d3Renderer.nodeSizeCache) {
              d3Renderer.nodeSizeCache.delete(nodeId)
            }
            
            // Xóa fixedWidth/fixedHeight từ d3Node
            const d3Node = d3Renderer.nodes.find(n => n.id === nodeId)
            if (d3Node?.data) {
              delete d3Node.data.fixedWidth
              delete d3Node.data.fixedHeight
            }
          } else {
            // Node có kích thước trong snapshot, giữ nguyên fixedWidth/fixedHeight đã được set ở trên
            console.log(`[Undo/Redo] ✅ Giữ nguyên fixedWidth/fixedHeight cho node ${nodeId}: ${restoredNode.data.rect.width}x${restoredNode.data.rect.height}`)
          }
        }
      })
      
      // Step 2: setData và render (giống realtime dòng 6155-6156)
      // ⚠️ FIX: Cache đã được khôi phục ở trên, render() sẽ dùng cache này
      d3Renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
      
      // ⚠️ CRITICAL: Sau khi setData(), đảm bảo fixedWidth/fixedHeight được set vào d3Renderer.nodes
      // Vì setData() có thể tạo nodes mới từ nodes.value, cần set lại fixedWidth/fixedHeight
      restoredNodes.forEach(node => {
        if (node.data?.rect) {
          const d3Node = d3Renderer.nodes.find(n => n.id === node.id)
          if (d3Node) {
            if (!d3Node.data) d3Node.data = {}
            d3Node.data.fixedWidth = node.data.rect.width
            d3Node.data.fixedHeight = node.data.rect.height
            // console.log(`[Undo/Redo] 🔧 Set lại fixedWidth/fixedHeight cho node ${node.id} sau setData(): ${node.data.rect.width}x${node.data.rect.height}`, {
            //   d3NodeHasFixedWidth: !!d3Node.data.fixedWidth,
            //   d3NodeHasFixedHeight: !!d3Node.data.fixedHeight,
            //   cacheSize: d3Renderer.nodeSizeCache.get(node.id)
            // })
          } else {
            console.warn(`[Undo/Redo] ⚠️ Không tìm thấy d3Node cho node ${node.id} sau setData()`)
          }
        }
      })
      
      d3Renderer.render()
      
      await nextTick()
      
      // Step 3: Update content và recalculate size cho nodes bị thay đổi (giống realtime)
      const nodesToUpdate = restoredNodes.filter(n => 
        n.id !== 'root' && 
        n.data?.label && 
        changedNodeIds.has(n.id)
      )
      
      console.log('[Undo/Redo] 📏 Update content và recalculate size cho', nodesToUpdate.length, 'nodes')
      
      // ⚠️ FIX: Đợi DOM được render trước khi set content
      await nextTick()
      
      for (const restoredNode of nodesToUpdate) {
        // ⚠️ FIX: Retry để đảm bảo editor instance sẵn sàng (giảm số lần retry và timeout)
        let editorInstance = d3Renderer.getEditorInstance(restoredNode.id)
        let attempts = 0
        const maxAttempts = 5
        
        while ((!editorInstance || editorInstance.isDestroyed) && attempts < maxAttempts) {
          await nextTick()
          editorInstance = d3Renderer.getEditorInstance(restoredNode.id)
          attempts++
        }
        
        if (editorInstance && !editorInstance.isDestroyed) {
          try {
            // ⚠️ FIX: Kiểm tra xem container có children không (Vue component đã mount chưa)
            const nodeGroup = d3Renderer.g.select(`[data-node-id="${restoredNode.id}"]`)
            const editorContainer = nodeGroup.select('.node-editor-container')
            const containerNode = editorContainer.node()
            const hasVueApp = d3Renderer.vueApps.has(restoredNode.id)
            const containerHasChildren = containerNode && containerNode.children.length > 0
            
            console.log(`[Undo/Redo] 🔍 Node ${restoredNode.id} - Kiểm tra mount:`, {
              hasNodeGroup: !nodeGroup.empty(),
              hasContainer: !!containerNode,
              hasVueApp,
              containerHasChildren,
              editorInstanceReady: !!editorInstance && !editorInstance.isDestroyed
            })
            
            // ⚠️ FIX: Nếu container rỗng nhưng có Vue app, unmount và mount lại
            if (hasVueApp && !containerHasChildren) {
              console.warn(`[Undo/Redo] ⚠️ Node ${restoredNode.id} có Vue app nhưng container rỗng, unmount và mount lại`)
              
              // Unmount Vue app cũ
              d3Renderer.unmountNodeEditor(restoredNode.id)
              
              // Trigger render lại để mount Vue component mới
              d3Renderer.render()
              await nextTick()
              
              // Kiểm tra lại sau khi render
              const retryContainerNode = d3Renderer.g.select(`[data-node-id="${restoredNode.id}"]`)
                .select('.node-editor-container')
                .node()
              const retryHasChildren = retryContainerNode && retryContainerNode.children.length > 0
              
              if (!retryHasChildren) {
                console.warn(`[Undo/Redo] ⚠️ Node ${restoredNode.id} vẫn rỗng sau khi render lại, thử mount thủ công`)
                // Thử mount thủ công nếu vẫn rỗng
                if (retryContainerNode) {
                  const nodeData = d3Renderer.nodes.find(n => n.id === restoredNode.id)
                  if (nodeData) {
                    const text = nodeData.data?.label || ''
                    const isRootNode = nodeData.id === 'root' || nodeData.data?.isRoot
                    const color = nodeData.data?.color || '#1f2937'
                    
                    d3Renderer.mountNodeEditor(restoredNode.id, retryContainerNode, {
                      value: text,
                      placeholder: 'Nhập...',
                      color: color,
                      minHeight: '43px',
                      width: '100%',
                      height: 'auto',
                      isRoot: isRootNode,
                      uploadImage: d3Renderer.uploadImage || null,
                      editable: d3Renderer.options?.permissions?.write === 1,
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
                    await nextTick()
                    
                    // ⚠️ CRITICAL: Lấy lại editor instance sau khi mount
                    editorInstance = d3Renderer.getEditorInstance(restoredNode.id)
                    
                    // Đợi thêm một chút để đảm bảo editor đã sẵn sàng
                    await nextTick()
                  }
                }
              }
              
              // ⚠️ CRITICAL: Lấy lại editor instance sau khi mount (nếu chưa có)
              if (!editorInstance) {
                editorInstance = d3Renderer.getEditorInstance(restoredNode.id)
              }
            }
            
            // ⚠️ CRITICAL: Kiểm tra editorInstance có tồn tại và có commands không
            if (!editorInstance || !editorInstance.commands) {
              console.warn(`[Undo/Redo] ⚠️ Editor instance không tồn tại hoặc không có commands cho node ${restoredNode.id}`, {
                hasEditorInstance: !!editorInstance,
                hasCommands: !!editorInstance?.commands,
                isDestroyed: editorInstance?.isDestroyed
              })
              continue
            }
            
            // ⚠️ FIX: Đảm bảo content không rỗng và convert plain text sang HTML nếu cần
            let contentToSet = restoredNode.data?.label || ''
            
            // ⚠️ FIX: Normalize Unicode để tránh lỗi dấu tiếng Việt khi undo/redo
            if (contentToSet && typeof contentToSet === 'string') {
              contentToSet = contentToSet.normalize('NFC')
            }
            
            // Nếu là plain text, convert sang HTML
            if (contentToSet && !/<[a-z][\s\S]*>/i.test(contentToSet.trim())) {
              contentToSet = `<p data-type="node-title">${contentToSet}</p>`
            } else if (!contentToSet || contentToSet.trim() === '' || contentToSet === '<p></p>') {
              contentToSet = '<p data-type="node-title"></p>'
            }
            
            // setContent
            if (typeof editorInstance.commands.setContent === 'function') {
              editorInstance.commands.setContent(contentToSet, false)
            } else {
              console.warn(`[Undo/Redo] ⚠️ Editor instance không có setContent command cho node ${restoredNode.id}`)
              continue
            }
            
            // ⚠️ FIX: Force update editor view để đảm bảo DOM được cập nhật
            if (editorInstance.view) {
              requestAnimationFrame(() => {
                const tr = editorInstance.view.state.tr
                editorInstance.view.dispatch(tr)
              })
            }
            
            // ⚠️ FIX: Đợi DOM được cập nhật (chỉ cần nextTick)
            await nextTick()
            
            console.log(`[Undo/Redo] ✅ Set content cho node ${restoredNode.id}`)
          } catch (e) {
            console.error(`[Undo/Redo] ❌ Lỗi khi update node ${restoredNode.id}:`, e)
          }
        } else {
          console.warn(`[Undo/Redo] ⚠️ Không thể lấy editor instance cho node ${restoredNode.id}`)
        }
      }
      
      // Đợi content được apply
      await nextTick()
      
      // ⚠️ FIX: Chỉ xóa fixed dimensions cho các node không có kích thước trong snapshot
      // Các node có kích thước trong snapshot sẽ giữ nguyên kích thước đã khôi phục
      for (const restoredNode of nodesToUpdate) {
        try {
          const d3Node = d3Renderer.nodes.find(n => n.id === restoredNode.id)
          if (d3Node?.data) {
            // ⚠️ FIX: Chỉ xóa fixedWidth/fixedHeight, KHÔNG xóa rect
            // rect chứa kích thước từ snapshot và cần được giữ lại
            delete d3Node.data.fixedWidth
            delete d3Node.data.fixedHeight
            // KHÔNG xóa d3Node.data.rect vì nó chứa kích thước từ snapshot
          }
          
          // ⚠️ FIX: Chỉ xóa cache nếu node không có kích thước trong snapshot
          // Nếu node có kích thước trong snapshot, cache đã được khôi phục ở trên và không nên xóa
          if (!restoredNode.data?.rect) {
            d3Renderer.nodeSizeCache.delete(restoredNode.id)
            console.log(`[Undo/Redo] ✅ Cleared cache cho node ${restoredNode.id} (không có kích thước trong snapshot)`)
          } else {
            console.log(`[Undo/Redo] ✅ Giữ nguyên cache cho node ${restoredNode.id} (có kích thước trong snapshot: ${restoredNode.data.rect.width}x${restoredNode.data.rect.height})`)
          }
          
          d3Renderer.positions?.delete(restoredNode.id)
        } catch (e) {
          console.error(`[Undo/Redo] ❌ Lỗi khi clear dimensions node ${restoredNode.id}:`, e)
        }
      }
      
      // Step 4: Render lại để node được render trước khi apply kích thước
      if (d3Renderer) {
        // Gọi setData và render để node được render vào DOM
        d3Renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
        d3Renderer.render()
        
        // ⚠️ FIX: Đợi DOM được render xong trước khi apply kích thước
        await nextTick()
        await new Promise(resolve => requestAnimationFrame(resolve))
        
        // Re-estimate size và apply vào DOM ngay lập tức
        for (const restoredNode of nodesToUpdate) {
          try {
            const d3Node = d3Renderer.nodes.find(n => n.id === restoredNode.id)
            if (d3Node) {
              // ⚠️ FIX: Ưu tiên dùng kích thước từ snapshot nếu có
              // Chỉ tính toán lại nếu node thay đổi nội dung và không có kích thước trong snapshot
              let newSize
              if (restoredNode.data?.rect) {
                // Dùng kích thước từ snapshot (đã được khôi phục vào cache ở trên)
                newSize = d3Renderer.nodeSizeCache.get(restoredNode.id) || {
                  width: restoredNode.data.rect.width,
                  height: restoredNode.data.rect.height
                }
                console.log(`[Undo/Redo] 📐 Dùng kích thước từ snapshot cho node ${restoredNode.id}: ${newSize.width}x${newSize.height}`)
              } else {
                // Không có kích thước trong snapshot, tính toán lại
                newSize = d3Renderer.estimateNodeSize(d3Node)
                console.log(`[Undo/Redo] 📐 Tính toán lại kích thước cho node ${restoredNode.id}: ${newSize.width}x${newSize.height}`)
              }
              d3Renderer.nodeSizeCache.set(restoredNode.id, newSize)
              
              // ⚠️ QUAN TRỌNG: Apply size TRỰC TIẾP vào DOM ngay lập tức
              const nodeGroup = d3Renderer.g.select(`[data-node-id="${restoredNode.id}"]`)
              if (!nodeGroup.empty()) {
                const rect = nodeGroup.select('.node-rect')
                const fo = nodeGroup.select('.node-text')
                
                if (!rect.empty() && !fo.empty()) {
                  const borderOffset = 4
                  
                  // Set width
                  rect.attr('width', newSize.width)
                  rect.node()?.setAttribute('width', newSize.width + 3)
                  
                  // Set height
                  rect.attr('height', newSize.height)
                  rect.node()?.setAttribute('height', newSize.height)
                  
                  // Set foreignObject
                  const foWidth = Math.max(0, newSize.width + borderOffset)
                  const foHeight = Math.max(0, newSize.height - borderOffset)
                  fo.attr('width', foWidth)
                  fo.attr('height', foHeight)
                  fo.node()?.setAttribute('width', foWidth)
                  fo.node()?.setAttribute('height', foHeight)
                  
                  // ⚠️ CRITICAL: Reset ALL height-related styles to AUTO
                  // Điều này cho phép node tự động fit với nội dung mà không giữ kích thước cũ
                  const wrapperNode = fo.select('.node-content-wrapper').node()
                  if (wrapperNode) {
                    wrapperNode.style.removeProperty('height')
                    wrapperNode.style.removeProperty('min-height')
                    wrapperNode.style.removeProperty('max-height')
                    wrapperNode.style.setProperty('height', 'auto', 'important')
                    wrapperNode.style.setProperty('min-height', '0', 'important')
                    wrapperNode.style.setProperty('max-height', 'none', 'important')
                  }
                  
                  const containerNode = fo.select('.node-editor-container').node()
                  if (containerNode) {
                    containerNode.style.removeProperty('height')
                    containerNode.style.removeProperty('min-height')
                    containerNode.style.removeProperty('max-height')
                    containerNode.style.setProperty('height', 'auto', 'important')
                    containerNode.style.setProperty('min-height', '0', 'important')
                    containerNode.style.setProperty('max-height', 'none', 'important')
                  }
                  
                  // Set editor content to auto height với min-height phù hợp
                  const editorInstance = d3Renderer.getEditorInstance(restoredNode.id)
                  if (editorInstance && !editorInstance.isDestroyed) {
                    const editorDOM = editorInstance.view?.dom
                    const editorContent = editorDOM?.querySelector('.mindmap-editor-prose') || editorDOM
                    if (editorContent) {
                      editorContent.style.removeProperty('height')
                      editorContent.style.removeProperty('min-height')
                      editorContent.style.removeProperty('max-height')
                      editorContent.style.setProperty('height', 'auto', 'important')
                      editorContent.style.setProperty('min-height', '43px', 'important')
                      editorContent.style.setProperty('max-height', 'none', 'important')
                      editorContent.style.setProperty('overflow', 'visible', 'important')
                      
                      // Force reflow để browser tính toán lại
                      void editorContent.offsetHeight
                      
                      // Đo height THỰC TẾ sau khi set auto
                      requestAnimationFrame(() => {
                        const actualHeight = editorContent.scrollHeight || editorContent.offsetHeight || 43
                        const finalHeight = Math.max(actualHeight, 43)
                        const finalFoHeight = Math.max(0, finalHeight - borderOffset)
                        
                        // Update rect và fo với height thực tế
                        rect.attr('height', finalHeight)
                        rect.node()?.setAttribute('height', finalHeight)
                        fo.attr('height', finalFoHeight)
                        fo.node()?.setAttribute('height', finalFoHeight)
                        
                        // ⚠️ QUAN TRỌNG: LOCK wrapper/container height để match với nội dung
                        // Nếu để auto, chúng sẽ expand ra đầy fo và tạo khoảng trắng
                        if (wrapperNode) {
                          wrapperNode.style.setProperty('height', `${finalFoHeight}px`, 'important')
                          wrapperNode.style.setProperty('min-height', `${finalFoHeight}px`, 'important')
                          wrapperNode.style.setProperty('max-height', `${finalFoHeight}px`, 'important')
                        }
                        
                        if (containerNode) {
                          containerNode.style.setProperty('height', `${finalFoHeight}px`, 'important')
                          containerNode.style.setProperty('min-height', `${finalFoHeight}px`, 'important')
                          containerNode.style.setProperty('max-height', `${finalFoHeight}px`, 'important')
                        }
                        
                        // Update cache
                        d3Renderer.nodeSizeCache.set(restoredNode.id, { width: newSize.width, height: finalHeight })
                        
                        if (Math.abs(finalHeight - newSize.height) > 2) {
                          console.log(`[Undo/Redo] 🔧 Adjusted height cho node ${restoredNode.id}: ${newSize.height} -> ${finalHeight}`)
                        } else {
                          console.log(`[Undo/Redo] ✅ Height chính xác cho node ${restoredNode.id}: ${finalHeight}px`)
                        }
                      })
                    }
                  }
                  
                  console.log(`[Undo/Redo] 📐 Applied size to DOM cho node ${restoredNode.id}: ${newSize.width}x${newSize.height}`)
                }
              }
            }
          } catch (e) {
            console.error(`[Undo/Redo] ❌ Lỗi khi re-estimate node ${restoredNode.id}:`, e)
          }
        }
      }
      
      // Step 5: Final render để apply kích thước mới
      // ⚠️ FIX: Đợi requestAnimationFrame hoàn thành việc đo height thực tế
      await nextTick()
      await new Promise(resolve => requestAnimationFrame(resolve))
      
      if (d3Renderer) {
        console.log('[Undo/Redo] 🎨 Final render với size đã được adjust')
        // ⚠️ FIX: Không gọi render() lại vì đã render ở Step 4
        // render() có thể tính toán lại kích thước và ghi đè cache đã được khôi phục
        // Thay vào đó, chỉ cần đảm bảo cache đã được set đúng
        console.log('[Undo/Redo] ✅ Đã apply kích thước vào DOM, không cần render lại')
      }
    }
  } finally {
    isRestoringSnapshot.value = false
  }
  
  // ⚠️ CRITICAL: Đợi editor được set content xong trước khi lưu
  // Đảm bảo editor đã có nội dung đầy đủ trước khi save
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 300))
  
  // ⚠️ CRITICAL: Đảm bảo node.data.label được giữ nguyên từ snapshot
  // Lưu lại label gốc từ snapshot
  const restoredLabelsMap = new Map()
  restoredNodes.forEach(node => {
    if (node.data?.label) {
      restoredLabelsMap.set(node.id, node.data.label)
      console.log(`[Undo/Redo] 💾 Lưu label từ snapshot cho node ${node.id}:`, {
        labelLength: node.data.label.length,
        labelPreview: node.data.label.substring(0, 100)
      })
    }
  })
  
  // ⚠️ CRITICAL: Đảm bảo elements.value có label đầy đủ từ snapshot
  // Vì nodes.value là computed từ elements.value, cần đảm bảo elements.value có label
  elements.value.forEach(element => {
    if (element.id && !element.source && !element.target && restoredLabelsMap.has(element.id)) {
      const originalLabel = restoredLabelsMap.get(element.id)
      if (!element.data) element.data = {}
      // Luôn set label từ snapshot vào elements.value để đảm bảo không bị mất
      element.data.label = originalLabel
      // console.log(`[Undo/Redo] 🔧 Set label vào elements.value cho node ${element.id} từ snapshot`)
    }
  })
  
  // Đảm bảo nodes.value có label đầy đủ từ snapshot trước khi lưu
  nodes.value.forEach(node => {
    if (node.id !== 'root' && restoredLabelsMap.has(node.id)) {
      const originalLabel = restoredLabelsMap.get(node.id)
      // Nếu node.data.label rỗng hoặc không có, dùng label từ snapshot
      if (!node.data?.label || node.data.label.trim() === '' || node.data.label === '<p></p>' || node.data.label === '<p data-type="node-title"></p>') {
        if (!node.data) node.data = {}
        node.data.label = originalLabel
        console.log(`[Undo/Redo] 🔧 Khôi phục label từ snapshot cho node ${node.id} trong nodes.value trước khi lưu:`, {
          labelLength: originalLabel.length,
          labelPreview: originalLabel.substring(0, 100)
        })
      } else {
        console.log("")
      }
    }
  })
  
  // So sánh để tìm nodes deleted, added, updated
  const newNodesMap = new Map()
  nodes.value.forEach(node => {
    newNodesMap.set(node.id, node)
  })
  
  // Tìm nodes đã bị xóa (có trong old nhưng không có trong new)
  const deletedNodeIds = []
  oldNodesMap.forEach((node, id) => {
    if (id !== 'root' && !newNodesMap.has(id)) {
      deletedNodeIds.push(id)
    }
  })
  
  // Tìm nodes added hoặc updated
  nodes.value.forEach(node => {
    if (node.id === 'root') return
    
    const oldNode = oldNodesMap.get(node.id)
    if (!oldNode) {
      // Node mới được thêm
      changedNodeIds.value.add(node.id)
    } else {
      // Kiểm tra xem node có thay đổi không
      const oldLabel = oldNode.data?.label || ''
      const newLabel = node.data?.label || ''
      if (oldLabel !== newLabel) {
        changedNodeIds.value.add(node.id)
      }
    }
  })
  
  console.log('[Undo/Redo] 📊 Thay đổi phát hiện:', {
    deleted: deletedNodeIds.length,
    changedOrAdded: changedNodeIds.value.size
  })
  
  // Broadcast nodes deleted nếu có
  if (deletedNodeIds.length > 0 && permissions.value.write) {
    savingCount.value++
    deleteNodesResource.submit({
      entity_name: props.entityName,
      node_ids: JSON.stringify(deletedNodeIds)
    })
    console.log('[Undo/Redo] ✅ Đang broadcast xóa nodes:', deletedNodeIds)
  }
  
  // Lưu và broadcast nodes updated/added
  scheduleSave()
}

// Delete functions moved to useMindmapDelete composable

// Task link drag warning moved to useMindmapDelete composable


// ===== Liên kết công việc cho nhánh =====
openTaskLinkModal = async (node) => {
  taskLinkNode.value = resolveTaskLinkNode(node)
  taskLinkMode.value = 'existing'
  taskSearch.value = ''
  taskLinkUrl.value = ''
  taskPage.value = 1
  
  // Fetch project options và tasks song song
  await Promise.all([
    fetchProjectOptions(),
    fetchTaskOptions({ resetPage: true })
  ])
  
  // Mở modal sau khi đã fetch xong để đảm bảo project options đã có
  showTaskLinkModal.value = true
  selectedTaskId.value = filteredTasks.value?.[0]?.id || null
}

const closeTaskLinkModal = () => {
  showTaskLinkModal.value = false
  taskLinkNode.value = null
}

const confirmTaskLink = async () => {
  const linkNode = resolveTaskLinkNode(taskLinkNode.value)
  if (!linkNode) {
    closeTaskLinkModal()
    return
  }
  const targetNode = resolveTaskLinkNode(linkNode)
  if (!targetNode) {
    closeTaskLinkModal()
    return
  }
  if (targetNode.data?.taskLink?.taskId) {
    toast({ title: "Node này đã liên kết công việc", indicator: "orange" })
    closeTaskLinkModal()
    return
  }

  const selectedTask = taskOptions.value.find(t => t.id === selectedTaskId.value) || null
  const plainTitle = extractTitleFromLabel(targetNode.data?.label || '')

  const fallbackLink = getDefaultTaskLink(targetNode.id, props.team, props.entityName)
  const projectId = selectedTask?.project || selectedTask?.project_name
  const taskOpenLink = selectedTask?.id && projectId
    ? getTaskOpenUrl(selectedTask.id, projectId)
    : ''

  const taskPayload = {
    mode: taskLinkMode.value,
    nodeId: targetNode.id,
    title: taskLinkMode.value === 'existing'
      ? selectedTask?.title || ''
      : plainTitle || targetNode.data?.label || '',
    taskId: taskLinkMode.value === 'existing' ? selectedTask?.id || null : null,
    assignee: selectedTask?.assignee || null,
    status: selectedTask?.status || null,
    linkUrl: fallbackLink
  }

  targetNode.data = {
    ...targetNode.data,
    taskLink: taskPayload
  }

  try {
    // Tạo comment link (Task)
    if (taskPayload.linkUrl && taskPayload.taskId) {
      const nodeTitle = plainTitle || targetNode.data?.label || ''
      const mindmapTitle = mindmap.data?.title || ''
      await call("drive.api.mindmap_comment.add_task_link_comment", {
        task_id: taskPayload.taskId,
        node_title: nodeTitle,
        mindmap_title: mindmapTitle,
        link_url: taskPayload.linkUrl
      })

      console.log(">>>>>>>> mode:", taskPayload.mode);
      console.log(">>>>>>>> status:", taskPayload.status);
      

      emitter.emit("task-link-node", {
        nodeId: targetNode.id,
        taskId: taskPayload.taskId,
        projectId,
        linkUrl: taskOpenLink,
        title: taskPayload.title,
        mode: taskPayload.mode,
        status: taskPayload.status,
      })           
    }

    // Thêm badge tick xanh dưới title node (ngay sau paragraph đầu tiên, trước ảnh)
    // Wrap badge trong section riêng để dễ phân biệt và style
    // Tự động thêm badge khi chọn công việc có sẵn
    if (taskPayload.linkUrl) {
      const badgeHtml = `<section class="node-task-link-section" data-node-section="task-link" data-type="node-task-link" style="margin-top:6px;"><div class="node-task-badge" style="display:flex;align-items:center;font-size:12px;color:#16a34a;"><a href="${taskOpenLink}" target="_top" onclick="event.preventDefault(); window.parent && window.parent.location && window.parent.location.href ? window.parent.location.href=this.href : window.location.href=this.href;" style="color:#0ea5e9;text-decoration:none;">Liên kết công việc</a></div></section>`
      if (typeof targetNode.data?.label === 'string' && !targetNode.data.label.includes('node-task-badge')) {
        // Parse HTML để chèn badge vào đúng vị trí (ngay sau title, trước ảnh)
        try {
          const parser = new DOMParser()
          const doc = parser.parseFromString(targetNode.data.label, 'text/html')
          const body = doc.body
          
          // Xóa tất cả paragraph rỗng (is-empty hoặc chỉ có br/whitespace) và paragraph chứa ⋮
          const allParagraphs = body.querySelectorAll('p')
          allParagraphs.forEach(p => {
            const text = p.textContent?.trim() || ''
            const hasOnlyBr = p.querySelectorAll('br').length === p.childNodes.length && p.childNodes.length > 0
            const isEmpty = p.classList.contains('is-empty') || (text === '' && hasOnlyBr)
            const hasMenuDots = text === '⋮' || text.includes('⋮')
            if (isEmpty || hasMenuDots) {
              p.remove()
            }
          })
          
          // Xóa tất cả button menu (image-menu-button)
          const menuButtons = body.querySelectorAll('.image-menu-button, button[aria-label="Image options"]')
          menuButtons.forEach(btn => btn.remove())
          
          // ⚠️ FIX: Tìm tất cả các paragraphs có data-type="node-title" (title paragraphs)
          // và tìm paragraph cuối cùng trong số đó để chèn badge sau
          const allTitleParagraphs = Array.from(body.querySelectorAll('p'))
          const titleParagraphs = []
          
          allTitleParagraphs.forEach(p => {
            const dataType = p.getAttribute('data-type')
            const isInBlockquote = p.closest('blockquote') !== null
            
            // Kiểm tra xem có phải task link không
            const hasTaskLinkAnchor = p.querySelector('a[href*="task_id"]') || p.querySelector('a[href*="/mtp/project/"]')
            const text = p.textContent?.trim() || ''
            const hasTaskLinkText = text.includes('Liên kết công việc')
            const isTaskLink = p.querySelector('.node-task-link-section') || 
                              p.querySelector('[data-node-section="task-link"]') ||
                              p.classList.contains('node-task-link-section') ||
                              p.getAttribute('data-node-section') === 'task-link' ||
                              (hasTaskLinkText && hasTaskLinkAnchor) ||
                              dataType === 'node-task-link'
            
            // Nếu là title paragraph (không trong blockquote và không phải task-link)
            if (!isInBlockquote && !isTaskLink) {
              titleParagraphs.push(p)
              // Thêm class để phân biệt title
              p.classList.add('node-title-section')
              p.setAttribute('data-node-section', 'title')
            }
          })
          
          // Tìm paragraph cuối cùng trong số các title paragraphs
          const lastTitleParagraph = titleParagraphs.length > 0 ? titleParagraphs[titleParagraphs.length - 1] : null
          
          if (lastTitleParagraph) {
            // Tạo badge element
            const badgeElement = parser.parseFromString(badgeHtml, 'text/html').body.firstChild
            
            // Tìm ảnh đầu tiên trong toàn bộ body (có thể là img hoặc trong wrapper)
            const firstImage = body.querySelector('img, .image-wrapper-node, .image-wrapper')
            
            if (firstImage) {
              // Có ảnh - kiểm tra xem ảnh/wrapper có nằm trong một title paragraph không
              const imageWrapper = firstImage.closest('.image-wrapper-node, .image-wrapper')
              const imageContainer = imageWrapper || firstImage
              const imageParent = imageContainer.parentElement
              
              // Kiểm tra xem imageParent có phải là một title paragraph không
              const imageParentIsTitleParagraph = titleParagraphs.includes(imageParent)
              
              // Thêm class và attribute để phân biệt phần ảnh
              let finalImageContainer = imageContainer
              if (imageContainer.classList.contains('image-wrapper-node') || imageContainer.classList.contains('image-wrapper')) {
                // Đã có wrapper - thêm class vào wrapper
                imageContainer.classList.add('node-image-section')
                imageContainer.setAttribute('data-node-section', 'image')
              } else if (imageContainer.tagName === 'IMG') {
                // Ảnh không có wrapper - wrap trong section
                const imageSection = doc.createElement('section')
                imageSection.classList.add('node-image-section')
                imageSection.setAttribute('data-node-section', 'image')
                imageContainer.parentElement.insertBefore(imageSection, imageContainer)
                imageSection.appendChild(imageContainer)
                finalImageContainer = imageSection
              } else {
                // Element khác - thêm class trực tiếp
                imageContainer.classList.add('node-image-section')
                imageContainer.setAttribute('data-node-section', 'image')
              }
              
              // Cập nhật lại imageParent sau khi có thể đã wrap
              const updatedImageParent = finalImageContainer.parentElement
              const updatedImageParentIsTitleParagraph = titleParagraphs.includes(updatedImageParent)
              
              if (updatedImageParentIsTitleParagraph) {
                // Ảnh/wrapper nằm trong một title paragraph - tách ra và chèn badge
                const imageClone = finalImageContainer.cloneNode(true)
                finalImageContainer.remove()
                // Chèn badge sau title paragraph cuối cùng
                body.insertBefore(badgeElement, lastTitleParagraph.nextSibling)
                // Chèn ảnh sau badge
                body.insertBefore(imageClone, badgeElement.nextSibling)
              } else {
                // Ảnh ở element khác - chèn badge trước container của ảnh
                finalImageContainer.parentElement.insertBefore(badgeElement, finalImageContainer)
              }
            } else {
              // Không có ảnh - chèn badge ngay sau title paragraph cuối cùng
              if (lastTitleParagraph.nextSibling) {
                body.insertBefore(badgeElement, lastTitleParagraph.nextSibling)
              } else {
                body.appendChild(badgeElement)
              }
            }
            
            // Thêm class cho các paragraph còn lại (mô tả) để phân biệt
            const remainingParagraphs = body.querySelectorAll('p:not(.node-title-section)')
            remainingParagraphs.forEach(p => {
              if (!p.classList.contains('node-description-section')) {
                p.classList.add('node-description-section')
                p.setAttribute('data-node-section', 'description')
              }
            })
            
        // Serialize lại HTML và cleanup thêm một lần nữa để đảm bảo xóa hết <p>⋮</p>
        let cleanedHtml = body.innerHTML
        // Xóa tất cả paragraph chỉ chứa ⋮
        cleanedHtml = cleanedHtml.replace(/<p[^>]*>\s*⋮\s*<\/p>/gi, '')
        cleanedHtml = cleanedHtml.replace(/<p[^>]*>.*?⋮.*?<\/p>/gi, '')
        // Xóa tất cả ký tự ⋮ còn lại
        cleanedHtml = cleanedHtml.replace(/⋮/g, '')
        
        targetNode.data.label = cleanedHtml
          } else {
            // Không có paragraph - tạo paragraph mới cho title và chèn badge
            const titleParagraph = doc.createElement('p')
            titleParagraph.textContent = plainTitle || 'Nhánh mới'
            body.appendChild(titleParagraph)
            
            const badgeElement = parser.parseFromString(badgeHtml, 'text/html').body.firstChild
            body.appendChild(badgeElement)
            
            targetNode.data.label = body.innerHTML
          }
        } catch (err) {
          // Fallback: chèn vào cuối nếu parse lỗi
          console.error('Error parsing HTML for badge insertion:', err)
          targetNode.data.label = `${targetNode.data.label}${badgeHtml}`
        }
      }
      if (d3Renderer?.nodeSizeCache) {
        d3Renderer.nodeSizeCache.delete(targetNode.id)
      }
    }

    // Đồng bộ nội dung editor ngay lập tức
    const editorInstance = d3Renderer?.getEditorInstance?.(targetNode.id)
    if (editorInstance && typeof editorInstance.commands?.setContent === 'function') {
      editorInstance.commands.setContent(targetNode.data?.label || '', false)
    }

    const idx = nodes.value.findIndex(n => n.id === targetNode.id)
    if (idx !== -1) {
      nodes.value[idx] = { ...targetNode }
      elements.value = [...nodes.value, ...edges.value]
    }

    await updateD3RendererWithDelay(0)
    
    // ⚠️ CRITICAL: Trigger lại tính toán chiều cao node sau khi thêm badge
    // Đợi DOM cập nhật xong rồi mới tính toán lại chiều cao
    await nextTick()
    
    // ⚠️ FIX: Đợi nhiều frame để đảm bảo DOM đã cập nhật hoàn toàn với badge mới
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Đợi thêm một chút để đảm bảo editor đã cập nhật content với badge
        setTimeout(() => {
          // Tìm foreignObject element của node
          const nodeGroup = document.querySelector(`[data-node-id="${targetNode.id}"]`)
          if (nodeGroup && d3Renderer) {
            const foElement = nodeGroup.querySelector('.node-text')
            if (foElement) {
              // ⚠️ CRITICAL: Gọi trực tiếp handleEditorBlur để tính toán lại height
              // handleEditorBlur sẽ đo lại height từ DOM và cập nhật node size
              try {
                d3Renderer.handleEditorBlur(targetNode.id, foElement, targetNode)
              } catch (err) {
                console.error('Error calling handleEditorBlur:', err)
                // Fallback: gọi updateNodeHeight từ Vue component
                const vueAppEntry = d3Renderer?.vueApps?.get(targetNode.id)
                if (vueAppEntry?.instance && typeof vueAppEntry.instance.updateNodeHeight === 'function') {
                  vueAppEntry.instance.updateNodeHeight()
                }
              }
            }
          }
          
          // ⚠️ FIX: Lưu node SAU KHI tất cả thao tác DOM hoàn thành
          saveSnapshot()
          changedNodeIds.value.add(targetNode.id)
          saveImmediately()
        }, 150) // Tăng delay để đảm bảo DOM đã cập nhật
      })
    })
    
    toast({ title: "Đã liên kết công việc thành công", indicator: "green" })
    closeTaskLinkModal()
  } catch (err) {
    console.error("Link task failed", err)
    toast({ title: "Liên kết công việc thất bại", indicator: "red" })
    closeTaskLinkModal()
  }
}

deleteTaskLink = async (node) => {
  const targetNode = resolveTaskLinkNode(node)
  if (!targetNode) {
    return
  }
  
  if (!targetNode.data?.taskLink?.taskId) {
    toast({ title: "Node này chưa có liên kết công việc", indicator: "orange" })
    return
  }

  try {
    // Xóa task link section khỏi node label HTML
    if (typeof targetNode.data?.label === 'string') {
      try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(targetNode.data.label, 'text/html')
        const body = doc.body
        
        // ⚠️ DEBUG: Log HTML trước khi xóa
        
        
        // ⚠️ FIX: Xóa element có data-type="node-task-link" hoặc các element cũ (node-task-link-section, data-node-section="task-link")
        // Bao gồm cả section và paragraph có data-type="node-task-link"
        const taskLinkSections = body.querySelectorAll('[data-type="node-task-link"], .node-task-link-section, [data-node-section="task-link"]')
        
        
        taskLinkSections.forEach((element, index) => {
          
           
          element.remove()
        })
        
        // ⚠️ FIX: Xóa paragraph chứa link "Liên kết công việc" với task_id trong href (trường hợp task link được tạo dưới dạng paragraph và chưa có data-type)
        const paragraphs = body.querySelectorAll('p')
        paragraphs.forEach(p => {
          // Bỏ qua paragraph có data-type="node-title" hoặc nằm trong blockquote
          const dataType = p.getAttribute('data-type')
          const isInBlockquote = p.closest('blockquote') !== null
          
          if (dataType === 'node-title' || isInBlockquote) {
            return // Không xóa title hoặc paragraph trong blockquote
          }
          
          // Nếu đã có data-type="node-task-link", đã được xóa ở trên
          if (dataType === 'node-task-link') {
            return
          }
          
          // Kiểm tra xem paragraph có chứa link "Liên kết công việc" với task_id không
          const hasTaskLinkAnchor = p.querySelector('a[href*="task_id"]') || 
            p.querySelector('a[href*="/mtp/project/"]')
          const text = p.textContent?.trim() || ''
          const hasTaskLinkText = text.includes('Liên kết công việc')
          
          if (hasTaskLinkText && hasTaskLinkAnchor) {

            p.remove()
          }
        })
        
        // ⚠️ DEBUG: Log HTML sau khi xóa task link section
        
        
        // Cleanup: Xóa các paragraph rỗng hoặc chỉ chứa whitespace sau khi xóa task link
        // ⚠️ FIX: Không xóa paragraph có data-type="node-title" hoặc nằm trong blockquote
        const remainingParagraphs = body.querySelectorAll('p')
        remainingParagraphs.forEach(p => {
          // Bỏ qua paragraph có data-type="node-title" hoặc nằm trong blockquote
          const dataType = p.getAttribute('data-type')
          const isInBlockquote = p.closest('blockquote') !== null
          
          if (dataType === 'node-title' || isInBlockquote) {
            return // Không xóa title hoặc paragraph trong blockquote
          }
          
          const text = p.textContent?.trim() || ''
          const hasOnlyBr = p.querySelectorAll('br').length === p.childNodes.length && p.childNodes.length > 0
          const isEmpty = p.classList.contains('is-empty') || (text === '' && hasOnlyBr)
          const hasMenuDots = text === '⋮' || text.includes('⋮')
          if (isEmpty || hasMenuDots) {
            p.remove()
          }
        })
        
        // ⚠️ FIX: Đảm bảo luôn có ít nhất một paragraph title
        const hasTitleParagraph = body.querySelector('p[data-type="node-title"]') !== null
        if (!hasTitleParagraph) {
          // Nếu không có title paragraph, tạo một paragraph trống với data-type="node-title"
          const titleP = doc.createElement('p')
          titleP.setAttribute('data-type', 'node-title')
          // Chèn vào đầu body
          if (body.firstChild) {
            body.insertBefore(titleP, body.firstChild)
          } else {
            body.appendChild(titleP)
          }
        }
        
        // Serialize lại HTML
        let cleanedHtml = body.innerHTML
        
        // ⚠️ DEBUG: Log HTML trước khi kiểm tra rỗng
        
        
        // ⚠️ FIX: Đảm bảo HTML không rỗng
        if (!cleanedHtml || cleanedHtml.trim() === '') {
          console.warn('[deleteTaskLink] HTML rỗng, tạo title paragraph mặc định')
          cleanedHtml = '<p data-type="node-title"></p>'
        }
        
        // ⚠️ DEBUG: Log HTML cuối cùng
        
        
        targetNode.data.label = cleanedHtml
      } catch (err) {
        console.error('Error parsing HTML for task link removal:', err)
        // Fallback: thử parse lại với DOMParser
        try {
          const parser = new DOMParser()
          const doc = parser.parseFromString(targetNode.data.label, 'text/html')
          const body = doc.body
          
          // ⚠️ FIX: Xóa element có data-type="node-task-link" hoặc các element cũ
          const taskLinkSections = body.querySelectorAll('[data-type="node-task-link"], .node-task-link-section, [data-node-section="task-link"]')
          taskLinkSections.forEach(section => section.remove())
          
          // ⚠️ FIX: Đảm bảo luôn có ít nhất một paragraph title
          const hasTitleParagraph = body.querySelector('p[data-type="node-title"]') !== null
          if (!hasTitleParagraph) {
            const titleP = doc.createElement('p')
            titleP.setAttribute('data-type', 'node-title')
            if (body.firstChild) {
              body.insertBefore(titleP, body.firstChild)
            } else {
              body.appendChild(titleP)
            }
          }
          
          let cleanedHtml = body.innerHTML
          if (!cleanedHtml || cleanedHtml.trim() === '') {
            cleanedHtml = '<p data-type="node-title"></p>'
          }
          
          targetNode.data.label = cleanedHtml
        } catch (fallbackErr) {
          console.error('Error in fallback HTML parsing:', fallbackErr)
          // Nếu cả fallback cũng fail, chỉ xóa bằng regex đơn giản
          let cleanedLabel = targetNode.data.label
            .replace(/<section[^>]*data-type="node-task-link"[^>]*>.*?<\/section>/gi, '')
          
          if (!cleanedLabel || cleanedLabel.trim() === '') {
            cleanedLabel = '<p data-type="node-title"></p>'
          }
          
          targetNode.data.label = cleanedLabel
        }
      }
    }

    // Xóa taskLink khỏi node.data
    const { taskLink, ...restData } = targetNode.data
    targetNode.data = restData

    // ⚠️ CRITICAL: Đánh dấu node đã thay đổi để save
    changedNodeIds.value.add(targetNode.id)

    // ⚠️ CRITICAL: Xóa fixedWidth và fixedHeight để buộc đo lại từ DOM
    // Vì sau khi xóa task link, kích thước node có thể thay đổi
    if (targetNode.data) {
      delete targetNode.data.fixedWidth
      delete targetNode.data.fixedHeight
    }

    // Xóa cache size để buộc đo lại từ DOM
    if (d3Renderer?.nodeSizeCache) {
      d3Renderer.nodeSizeCache.delete(targetNode.id)
    }

    // Đồng bộ nội dung editor ngay lập tức
    const editorInstance = d3Renderer?.getEditorInstance?.(targetNode.id)
    if (editorInstance) {
      let contentToSet = targetNode.data?.label || ''
      
      
      
      // ⚠️ FIX: Đảm bảo content không rỗng
      if (!contentToSet || contentToSet.trim() === '') {
        console.warn('[deleteTaskLink] Content rỗng, tạo title paragraph mặc định')
        contentToSet = '<p data-type="node-title"></p>'
      }
      
      
      
      if (typeof editorInstance.commands?.setContent === 'function') {
        editorInstance.commands.setContent(contentToSet, false)
        
      }
      
      // ⚠️ FIX: Không gọi cleanupRemoveMenuText vì có thể tạo lại ⋮
      // Chỉ gọi nếu thực sự cần thiết
      // if (typeof editorInstance.cleanupRemoveMenuText === 'function') {
      //   setTimeout(() => {
      //     editorInstance.cleanupRemoveMenuText()
      //   }, 100)
      // }
    }

    // Cập nhật nodes array
    const idx = nodes.value.findIndex(n => n.id === targetNode.id)
    if (idx !== -1) {
      nodes.value[idx] = { ...targetNode }
      elements.value = [...nodes.value, ...edges.value]
    }

    // ⚠️ FIX: Gọi handleEditorBlur TRƯỚC updateD3Renderer để đảm bảo kích thước được set đúng
    // Sau đó mới updateD3Renderer để render lại với kích thước đúng
    await nextTick()
    
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          const nodeGroup = document.querySelector(`[data-node-id="${targetNode.id}"]`)
          if (nodeGroup && d3Renderer) {
            const foElement = nodeGroup.querySelector('.node-text')
            if (foElement) {
              try {
                // ⚠️ CRITICAL: Gọi handleEditorBlur để đo lại và set đúng kích thước
                d3Renderer.handleEditorBlur(targetNode.id, foElement, targetNode)
                
                // ⚠️ FIX: Sau khi handleEditorBlur đã set đúng kích thước, mới updateD3Renderer
                // Điều này đảm bảo renderNodes sẽ dùng kích thước từ rect (đã được set đúng)
                setTimeout(() => {
                  updateD3RendererWithDelay(0)
                  
                  // ⚠️ FIX: Lưu SAU KHI tất cả thao tác DOM hoàn thành
                  saveSnapshot()
                  scheduleSave()
                }, 100)
              } catch (err) {
                console.error('Error calling handleEditorBlur:', err)
                const vueAppEntry = d3Renderer?.vueApps?.get(targetNode.id)
                if (vueAppEntry?.instance && typeof vueAppEntry.instance.updateNodeHeight === 'function') {
                  vueAppEntry.instance.updateNodeHeight()
                }
                // Fallback: vẫn updateD3Renderer nếu có lỗi
                updateD3RendererWithDelay(0)
                
                // Lưu ngay cả khi có lỗi
                saveSnapshot()
                scheduleSave()
              }
            } else {
              // Nếu không tìm thấy foElement, vẫn updateD3Renderer
              updateD3RendererWithDelay(0)
              
              // Lưu ngay cả khi không tìm thấy foElement
              saveSnapshot()
              scheduleSave()
            }
          } else {
            // Nếu không tìm thấy nodeGroup, vẫn updateD3Renderer
            updateD3RendererWithDelay(0)
            
            // Lưu ngay cả khi không tìm thấy nodeGroup
            saveSnapshot()
            scheduleSave()
          }
        }, 150)
      })
    })
    
    toast({ title: "Đã xóa liên kết công việc thành công", indicator: "green" })
  } catch (err) {
    console.error("Delete task link failed", err)
    toast({ title: "Xóa liên kết công việc thất bại", indicator: "red" })
  }
}

// Handle create task from node
const handleCreateTask = async (formData) => {
  try {
    // Format date for backend
    const formatDateForBackend = (isoString) => {
      if (!isoString) return null
      const date = new Date(isoString)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    // Prepare payload
    const payload = {
      project: formData.project?.value,
      task_name: formData.task_name,
      assign_to: formData.name_assign_to?.value,
      assigned_by: formData.assigned_by?.value || null,
      priority: formData.priority?.value || null,
      duration: formData.duration ? formatDateForBackend(formData.duration) : null,
      section: formData.section_title?.value === '_empty' ? null : (formData.section_title?.value || null),
      description: formData.description || '',
      collaborator: (formData.collaborator || []).map((collab) => ({ 
        officer: collab.id || collab.value 
      })),
      parent_task: formData.parent_task?.value || null
    }

    

    // Call API to create task
    const response = await call('nextgrp.api.task.task.create_task', {
      payload: payload
    })

    

    // Check response format - API returns { message: { result: {...} } }
    // frappe-ui call may unwrap the response, so check multiple formats
    // In Raven, they use: response.message.result.name
    const taskResult = response?.message?.result || response?.result || response
    
    
    if (taskResult && taskResult.name) {
      const taskId = taskResult.name
      const projectId = formData.project?.value
      

      // Upload files if any
      if (formData.files && formData.files.length > 0) {
        for (const file of formData.files) {
          try {
            const formDataUpload = new FormData()
            formDataUpload.append('file', file)
            formDataUpload.append('doctype', 'Task')
            formDataUpload.append('docname', taskId)
            formDataUpload.append('fieldname', 'description')
            formDataUpload.append('folder', 'Home')
            formDataUpload.append('is_private', '1')

            await fetch('/api/method/upload_file', {
              method: 'POST',
              body: formDataUpload,
              headers: {
                'X-Frappe-CSRF-Token': window.csrf_token || document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
              }
            })
          } catch (fileError) {
            console.error('Failed to upload file:', fileError)
            // Continue even if file upload fails
          }
        }
      }

      // Link task to node
      const linkNode = resolveTaskLinkNode(taskLinkNode.value)
      if (linkNode) {
        const plainTitle = extractTitleFromLabel(linkNode.data?.label || '')
        const fallbackLink = getDefaultTaskLink(linkNode.id, props.team, props.entityName)
        const taskOpenLink = getTaskOpenUrl(taskId, projectId)

        linkNode.data = {
          ...linkNode.data,
          taskLink: {
            mode: 'existing',
            nodeId: linkNode.id,
            title: formData.task_name,
            taskId: taskId,
            assignee: formData.name_assign_to?.label || null,
            status: null,
            linkUrl: fallbackLink
          }
        }

        // Thêm badge "Liên kết công việc" vào node label (tương tự confirmTaskLink)
        // Tự động thêm badge khi tạo mới công việc từ node
        if (taskOpenLink && typeof linkNode.data?.label === 'string' && !linkNode.data.label.includes('node-task-badge')) {
          const badgeHtml = `<section class="node-task-link-section" data-node-section="task-link" data-type="node-task-link" style="margin-top:6px;"><div class="node-task-badge" style="display:flex;align-items:center;font-size:12px;color:#16a34a;"><a href="${taskOpenLink}" target="_top" onclick="event.preventDefault(); window.parent && window.parent.location && window.parent.location.href ? window.parent.location.href=this.href : window.location.href=this.href;" style="color:#0ea5e9;text-decoration:none;">Liên kết công việc</a></div></section>`
          try {
            const parser = new DOMParser()
            const doc = parser.parseFromString(linkNode.data.label, 'text/html')
            const body = doc.body
            
            // Xóa tất cả paragraph rỗng (is-empty hoặc chỉ có br/whitespace) và paragraph chứa ⋮
            const allParagraphs = body.querySelectorAll('p')
            allParagraphs.forEach(p => {
              const text = p.textContent?.trim() || ''
              const hasOnlyBr = p.querySelectorAll('br').length === p.childNodes.length && p.childNodes.length > 0
              const isEmpty = p.classList.contains('is-empty') || (text === '' && hasOnlyBr)
              const hasMenuDots = text === '⋮' || text.includes('⋮')
              if (isEmpty || hasMenuDots) {
                p.remove()
              }
            })
            
            // Xóa tất cả button menu (image-menu-button)
            const menuButtons = body.querySelectorAll('.image-menu-button, button[aria-label="Image options"]')
            menuButtons.forEach(btn => btn.remove())
            
            // ⚠️ FIX: Tìm tất cả các paragraphs có data-type="node-title" (title paragraphs)
            // và tìm paragraph cuối cùng trong số đó để chèn badge sau
            const allParagraphsForBadge = Array.from(body.querySelectorAll('p'))
            const titleParagraphsForBadge = []
            
            allParagraphsForBadge.forEach(p => {
              const dataType = p.getAttribute('data-type')
              const isInBlockquote = p.closest('blockquote') !== null
              
              // Kiểm tra xem có phải task link không
              const hasTaskLinkAnchor = p.querySelector('a[href*="task_id"]') || p.querySelector('a[href*="/mtp/project/"]')
              const text = p.textContent?.trim() || ''
              const hasTaskLinkText = text.includes('Liên kết công việc')
              const isTaskLink = p.querySelector('.node-task-link-section') || 
                                p.querySelector('[data-node-section="task-link"]') ||
                                p.classList.contains('node-task-link-section') ||
                                p.getAttribute('data-node-section') === 'task-link' ||
                                (hasTaskLinkText && hasTaskLinkAnchor) ||
                                dataType === 'node-task-link'
              
              // Nếu là title paragraph (không trong blockquote và không phải task-link)
              if (!isInBlockquote && !isTaskLink) {
                titleParagraphsForBadge.push(p)
                // Thêm class để phân biệt title
                p.classList.add('node-title-section')
                p.setAttribute('data-node-section', 'title')
              }
            })
            
            // Tìm paragraph cuối cùng trong số các title paragraphs
            const lastTitleParagraphForBadge = titleParagraphsForBadge.length > 0 ? titleParagraphsForBadge[titleParagraphsForBadge.length - 1] : null
            
            if (lastTitleParagraphForBadge) {
              // Tạo badge element
              const badgeElement = parser.parseFromString(badgeHtml, 'text/html').body.firstChild
              
              // Tìm ảnh đầu tiên trong toàn bộ body (có thể là img hoặc trong wrapper)
              const firstImage = body.querySelector('img, .image-wrapper-node, .image-wrapper')
              
              if (firstImage) {
                // Có ảnh - kiểm tra xem ảnh/wrapper có nằm trong một title paragraph không
                const imageWrapper = firstImage.closest('.image-wrapper-node, .image-wrapper')
                const imageContainer = imageWrapper || firstImage
                const imageParent = imageContainer.parentElement
                
                // Kiểm tra xem imageParent có phải là một title paragraph không
                const imageParentIsTitleParagraph = titleParagraphsForBadge.includes(imageParent)
                
                // Thêm class và attribute để phân biệt phần ảnh
                let finalImageContainer = imageContainer
                if (imageContainer.classList.contains('image-wrapper-node') || imageContainer.classList.contains('image-wrapper')) {
                  // Đã có wrapper - thêm class vào wrapper
                  imageContainer.classList.add('node-image-section')
                  imageContainer.setAttribute('data-node-section', 'image')
                } else if (imageContainer.tagName === 'IMG') {
                  // Ảnh không có wrapper - wrap trong section
                  const imageSection = doc.createElement('section')
                  imageSection.classList.add('node-image-section')
                  imageSection.setAttribute('data-node-section', 'image')
                  imageContainer.parentElement.insertBefore(imageSection, imageContainer)
                  imageSection.appendChild(imageContainer)
                  finalImageContainer = imageSection
                } else {
                  // Element khác - thêm class trực tiếp
                  imageContainer.classList.add('node-image-section')
                  imageContainer.setAttribute('data-node-section', 'image')
                }
                
                // Cập nhật lại imageParent sau khi có thể đã wrap
                const updatedImageParent = finalImageContainer.parentElement
                const updatedImageParentIsTitleParagraph = titleParagraphsForBadge.includes(updatedImageParent)
                
                if (updatedImageParentIsTitleParagraph) {
                  // Ảnh/wrapper nằm trong một title paragraph - tách ra và chèn badge
                  const imageClone = finalImageContainer.cloneNode(true)
                  finalImageContainer.remove()
                  // Chèn badge sau title paragraph cuối cùng
                  body.insertBefore(badgeElement, lastTitleParagraphForBadge.nextSibling)
                  // Chèn ảnh sau badge
                  body.insertBefore(imageClone, badgeElement.nextSibling)
                } else {
                  // Ảnh ở element khác - chèn badge trước container của ảnh
                  finalImageContainer.parentElement.insertBefore(badgeElement, finalImageContainer)
                }
              } else {
                // Không có ảnh - chèn badge ngay sau title paragraph cuối cùng
                if (lastTitleParagraphForBadge.nextSibling) {
                  body.insertBefore(badgeElement, lastTitleParagraphForBadge.nextSibling)
                } else {
                  body.appendChild(badgeElement)
                }
              }
            } else {
              // Không có title paragraph - tạo paragraph mới cho title và chèn badge
              const titleParagraph = doc.createElement('p')
              titleParagraph.textContent = plainTitle || 'Nhánh mới'
              body.appendChild(titleParagraph)
              
              const badgeElement = parser.parseFromString(badgeHtml, 'text/html').body.firstChild
              body.appendChild(badgeElement)
            }
            
            // Thêm class cho các paragraph còn lại (mô tả) để phân biệt
            const remainingParagraphs = body.querySelectorAll('p:not(.node-title-section)')
            remainingParagraphs.forEach(p => {
              if (!p.classList.contains('node-description-section')) {
                p.classList.add('node-description-section')
                p.setAttribute('data-node-section', 'description')
              }
            })
            
            // Serialize lại HTML
            linkNode.data.label = body.innerHTML
          } catch (err) {
            // Fallback: chèn vào cuối nếu parse lỗi
            console.error('Error parsing HTML for badge insertion:', err)
            linkNode.data.label = `${linkNode.data.label}${badgeHtml}`
          }
          
          // Clear node size cache
          if (d3Renderer?.nodeSizeCache) {
            d3Renderer.nodeSizeCache.delete(linkNode.id)
          }
          
          // Đồng bộ nội dung editor ngay lập tức
          const editorInstance = d3Renderer?.getEditorInstance?.(linkNode.id)
          if (editorInstance && typeof editorInstance.commands?.setContent === 'function') {
            editorInstance.commands.setContent(linkNode.data?.label || '', false)
            
            // ⚠️ FIX: Gọi setDataTypesForElements sau khi set content để thêm data-type="node-task-link" vào paragraph
            if (typeof editorInstance.setDataTypesForElements === 'function') {
              setTimeout(() => {
                editorInstance.setDataTypesForElements()
              }, 100)
            }
          }
          
          // Cập nhật nodes array
          const idx = nodes.value.findIndex(n => n.id === linkNode.id)
          if (idx !== -1) {
            nodes.value[idx] = { ...linkNode }
            elements.value = [...nodes.value, ...edges.value]
          }
          
          await updateD3RendererWithDelay(0)
        }

        // Update mindmap - get vueAppEntry from d3Renderer
        await nextTick()
        
        // ⚠️ FIX: Đợi nhiều frame để đảm bảo DOM đã cập nhật hoàn toàn với badge mới
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Đợi thêm một chút để đảm bảo editor đã cập nhật content với badge
            setTimeout(() => {
              // Tìm foreignObject element của node
              const nodeGroup = document.querySelector(`[data-node-id="${linkNode.id}"]`)
              if (nodeGroup && d3Renderer) {
                const foElement = nodeGroup.querySelector('.node-text')
                if (foElement) {
                  // ⚠️ CRITICAL: Gọi trực tiếp handleEditorBlur để tính toán lại height
                  // handleEditorBlur sẽ đo lại height từ DOM và cập nhật node size
                  try {
                    d3Renderer.handleEditorBlur(linkNode.id, foElement, linkNode)
                  } catch (err) {
                    console.error('Error calling handleEditorBlur:', err)
                    // Fallback: gọi updateNodeHeight từ Vue component
                    const vueAppEntry = d3Renderer?.vueApps?.get(linkNode.id)
                    if (vueAppEntry?.instance && typeof vueAppEntry.instance.updateNodeHeight === 'function') {
                      vueAppEntry.instance.updateNodeHeight()
                    }
                  }
                }
              }
              
              // ⚠️ FIX: Lưu node SAU KHI tất cả thao tác DOM hoàn thành
              changedNodeIds.value.add(linkNode.id)
              saveImmediately()
            }, 150) // Tăng delay để đảm bảo DOM đã cập nhật
          })
        })
        // Add comment link to task (giống như confirmTaskLink)
        if (fallbackLink && taskId) {
          const nodeTitle = plainTitle || linkNode.data?.label || ''
          const mindmapTitle = mindmap.data?.title || ''
          try {
            await call("drive.api.mindmap_comment.add_task_link_comment", {
              task_id: taskId,
              node_title: nodeTitle,
              mindmap_title: mindmapTitle,
              link_url: fallbackLink
            })
          } catch (err) {
            console.error('Error adding task link comment:', err)
            // Continue even if comment creation fails
          }
        }

        emitter.emit("task-link-node", {
          nodeId: linkNode.id,
          taskId: taskId,
          projectId: projectId,
          linkUrl: getTaskOpenUrl(taskId, projectId),
          title: formData.task_name,
          mode: 'existing',
          status: 'Thực hiện'
        })        
      } else {
        // Không có linkNode - task được tạo nhưng không liên kết với node
        console.warn('[handleCreateTask] Task created successfully but no linkNode found')
      }

      // Show success message with link
      const origin = window.location.origin
      const taskUrl = `${origin}/mtp/project/${projectId}?task_id=${taskId}`
      
      toast({ 
        title: `Công việc "${formData.task_name}" đã được tạo thành công`, 
        indicator: "green",
        action: {
          label: "Mở công việc",
          onClick: () => {
            window.open(taskUrl, '_blank')
          }
        }
      })

      closeTaskLinkModal()
    } else {
      // Log for debugging
      console.error('Task creation failed - invalid response:', response)
      console.error('Response keys:', Object.keys(response || {}))
      console.error('Response.message:', response?.message)
      console.error('Response.message.result:', response?.message?.result)
      const errorMsg = response?.message || response?.errorMessage || 'Không thể tạo công việc'
      throw new Error(errorMsg)
    }
  } catch (error) {
    // Extract error message from various possible formats
    let errorMessage = 'Có lỗi xảy ra khi tạo công việc'
    
    // Xử lý lỗi CharacterLengthExceededError và dịch sang tiếng Việt
    const errorStr = typeof error === 'string' ? error : (error?.message || JSON.stringify(error))
    if (errorStr.includes('CharacterLengthExceededError') || errorStr.includes('character length')) {
      errorMessage = 'Tên công việc không được vượt quá 500 ký tự.'
    } else if (error?.message?.result) {
      errorMessage = error.message.result
    } else if (error?.message) {
      errorMessage = typeof error.message === 'string' ? error.message : JSON.stringify(error.message)
    } else if (typeof error === 'string') {
      errorMessage = error
    }
    
    toast(errorMessage)
  }
}

// Keyboard handlers moved to useMindmapKeyboard composable



// Watch nodes/edges changes to update D3 renderer
// KHÔNG update khi đang edit hoặc đang select node để tránh node nháy và text nhảy dòng
watch([nodes, edges], () => {
  if (isRestoringSnapshot.value) {
    return
  }
  if (d3Renderer && !editingNode.value && !selectedNode.value) {
    updateD3Renderer()
  }
}, { deep: true })

// Save resource

const broadcastNodeEditing = (nodeId, isEditing) => {
  if (!mindmap.data) return
  
  const lastState = lastBroadcastState.value.get(nodeId)
  
  if (lastState === isEditing) {
    console.log(`⏭️ Bỏ qua broadcast duplicate cho node ${nodeId}, state=${isEditing}`)
    return
  }
  
  console.log(`📡 Broadcasting editing state: node=${nodeId}, isEditing=${isEditing}`)
  lastBroadcastState.value.set(nodeId, isEditing)
  
  broadcastEditingResource.submit({
    entity_name: props.entityName,
    node_id: nodeId,
    is_editing: isEditing
  })
}

const saveNode = (nodeId) => {
  saveOperations.saveNode({
    nodeId,
    entityName: props.entityName,
    nodes,
    edges,
    d3Renderer,
    nodeCreationOrder,
    permissions,
    mindmapData: mindmap.data
  })
}

const saveImmediately = () => {
  saveOperations.saveImmediately({
    entityName: props.entityName,
    nodes,
    edges,
    d3Renderer,
    nodeCreationOrder,
    permissions,
    mindmapData: mindmap.data,
    elements
  })
}

scheduleSave = () => {
  saveOperations.scheduleSave({
    entityName: props.entityName,
    nodes,
    edges,
    d3Renderer,
    nodeCreationOrder,
    permissions,
    mindmapData: mindmap.data,
    elements
  })
}

// Handle import complete event from export dialog
const handleImportComplete = async () => {
  // Reload mindmap data after import
  await mindmap.fetch()
  
  // Reinitialize mindmap with new data
  if (mindmap.data) {
    await initializeMindmap(mindmap.data)
  }
}


const handleBeforeUnload = (e) => {
  // ⚠️ NEW: Cleanup tất cả editing states của user khi reload/đóng tab
  // Luôn gọi cleanup để đảm bảo xóa editing states của user (kể cả khi không có trong nodeEditingUsers
  // vì API không trả về editing states của chính user đó)
  try {
    const url = `/api/method/drive.api.mindmap.cleanup_user_editing_states`
    const data = JSON.stringify({
      entity_name: props.entityName
    })
    
    // Dùng fetch với keepalive để đảm bảo request được gửi khi page unload
    // sendBeacon không hỗ trợ custom headers (cần CSRF token cho Frappe)
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: data,
      keepalive: true,
      credentials: 'include'
    }).catch(err => {
      console.error('[Editing] ❌ Failed to cleanup editing states:', err)
    })
    console.log('[Editing] 🧹 Sent cleanup request via fetch (keepalive)')
  } catch (error) {
    console.error('[Editing] ❌ Error cleaning up editing states:', error)
  }
  
  if (textInputSaveTimeout || saveTimeout || textInputSnapshotTimeout) {
    if (textInputSaveTimeout) {
      clearTimeout(textInputSaveTimeout)
      textInputSaveTimeout = null
    }
    if (textInputSnapshotTimeout) {
      clearTimeout(textInputSnapshotTimeout)
      saveSnapshot()
      textInputSnapshotTimeout = null
    }
    if (formattingSnapshotTimeout) {
      clearTimeout(formattingSnapshotTimeout)
      saveSnapshot()
      formattingSnapshotTimeout = null
    }
    if (saveTimeout) {
      clearTimeout(saveTimeout)
      saveTimeout = null
    }
    saveImmediately()
  }
}

const handleVisibilityChange = () => {
  if (document.visibilityState === 'hidden') {
    if (textInputSaveTimeout || saveTimeout || textInputSnapshotTimeout || formattingSnapshotTimeout) {
      if (textInputSaveTimeout) {
        clearTimeout(textInputSaveTimeout)
        textInputSaveTimeout = null
      }
      if (textInputSnapshotTimeout) {
        clearTimeout(textInputSnapshotTimeout)
        saveSnapshot()
        textInputSnapshotTimeout = null
      }
      if (formattingSnapshotTimeout) {
        clearTimeout(formattingSnapshotTimeout)
        saveSnapshot()
        formattingSnapshotTimeout = null
      }
      if (saveTimeout) {
        clearTimeout(saveTimeout)
        saveTimeout = null
      }
      saveImmediately()
    }
  }
}


onMounted(() => {
  // Fetch resources after all functions are assigned
  mindmap.fetch()
  mindmapEntity.fetch()

  if (!store.getters.isLoggedIn) {
    sessionStorage.setItem("sharedFileInfo", JSON.stringify({
      team: props.team,
      entityName: props.entityName,
      entityType: "mindmap"
    }))
  }

  window.addEventListener('keydown', handleKeyDown, true)
  
  // ⚠️ NEW: Handle composition events (Unikey/IME)
  window.addEventListener('compositionstart', handleCompositionStart, true)
  window.addEventListener('compositionend', handleCompositionEnd, true)

  // ⚠️ NEW: Handle copy event để lưu text vào clipboard
  window.addEventListener('copy', handleCopy, true)

  // ⚠️ FIX: Track network status để ngăn undo/redo khi mất kết nối
  const handleOnline = () => {
    isOnline.value = true
    console.log('[Network] ✅ Kết nối mạng đã được khôi phục')
  }
  
  const handleOffline = () => {
    isOnline.value = false
    console.log('[Network] ❌ Mất kết nối mạng')
  }
  
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  
  // Initialize network status
  isOnline.value = navigator.onLine
  
  // Store handlers để cleanup sau
  window.__mindmapOnlineHandler = handleOnline
  window.__mindmapOfflineHandler = handleOffline

  // ⭐ Initialize permission version (only once on mount)
  initializePermissionVersion(props.entityName)

  // ⭐ Listen for permission revoked event via socket (realtime)
  if (socket) {
    console.log("📡 Registering socket listener for permission_revoked (mindmap)")
    console.log("   Current entityName:", props.entityName)
    
    // Register listener
    socket.on("permission_revoked", (message) => {
      console.log("📨 Raw permission_revoked event received:", message)
      handleSocketPermissionRevoked(message, props.entityName)
    })
    
    // Re-register listener on reconnect
    socket.on("connect", () => {
      console.log("🔄 Socket reconnected, re-registering permission_revoked listener (mindmap)")
      socket.on("permission_revoked", (message) => {
        console.log("📨 Raw permission_revoked event received (after reconnect):", message)
        handleSocketPermissionRevoked(message, props.entityName)
      })
    })
  } else {
    console.warn("⚠️ Socket is not available, permission changes will not be detected in real-time")
  }

  // ⚠️ DEBUG: Expose functions to window for debugging
  if (typeof window !== 'undefined') {
    window.__debugMindmap = {
      logHistory: logHistoryStack,
      getHistoryStack: () => historyStack.value,
      getHistoryIndex: () => historyIndex.value,
      undo,
      redo
    }
    console.log('🐛 Debug tools available: window.__debugMindmap')
    console.log('   - window.__debugMindmap.logHistory() : Xem lịch sử snapshot')
    console.log('   - window.__debugMindmap.undo()       : Undo thủ công')
    console.log('   - window.__debugMindmap.redo()       : Redo thủ công')
  }

  // Handle window resize
  window.addEventListener('resize', () => {
    if (d3Renderer) {
      d3Renderer.options.width = window.innerWidth
      d3Renderer.options.height = window.innerHeight - 84
      if (d3Renderer.svg) {
        d3Renderer.svg.attr('width', window.innerWidth)
        d3Renderer.svg.attr('height', window.innerHeight - 84)
      }
      updateD3Renderer()
    }
  })

  

  // ⚠️ NOTE: scrollToNodeFromHash được gọi trong onRenderComplete callback
  // Không gọi ở đây vì mindmap chưa được load và renderer chưa sẵn sàng

  // ⚠️ NEW: Lắng nghe sự kiện hashchange để scroll đến node khi hash thay đổi
  window.addEventListener('hashchange', scrollToNodeFromHash)


  // ⚠️ NEW: Đăng ký socket listeners với safety check
  if (socket) {
    
    socket.on('drive_mindmap:comment_deleted', handleRealtimeDeleteOneComment)
    socket.on('drive_mindmap:node_resolved', handleRealtimeResolvedComment)
    socket.on('drive_mindmap:task_status_updated', handleRealtimeTaskStatusUpdate)
    socket.on('drive_mindmap:new_comment', handleRealtimeNewComment)
    socket.on('drive_mindmap:node_unresolved', handleRealtimeUnresolvedComment)
    // socket.on('drive_mindmap:updated', handleRealtimeMindmapUpdate)
    socket.on('drive_mindmap:node_updated', handleRealtimeNodeUpdate)
    socket.on('drive_mindmap:nodes_updated_batch', handleRealtimeNodesBatchUpdate)
    socket.on('drive_mindmap:nodes_deleted', handleRealtimeNodesDeleted)
    socket.on('drive_mindmap:node_editing', handleRealtimeNodeEditing)
    
    // ⚠️ FIX: Listen for collapsed nodes updates để sync realtime
    socket.on('drive_mindmap:collapsed_nodes_updated', (message) => {
      if (!message || message.entity_name !== props.entityName) return
      
      const currentUser = store.state.user?.id
      // Bỏ qua nếu là event từ chính mình (đã được xử lý ở onNodeCollapse)
      if (message.modified_by === currentUser) {
        console.log('[Collapse] ⏸️ Bỏ qua update từ chính mình')
        return
      }
      
      console.log('[Collapse] 📡 Received collapsed_nodes_updated from remote:', message.collapsed_node_ids)
      
      // Update collapsed nodes trong renderer và ref
      if (d3Renderer && message.collapsed_node_ids) {
        collapsedNodesFromDB.value = message.collapsed_node_ids
        d3Renderer.collapsedNodes = new Set(message.collapsed_node_ids)
        // Re-render để cập nhật UI
        updateD3Renderer()
        console.log('[Collapse] ✅ Updated collapsed nodes from remote, re-rendered')
      }
    })
    
    // ⚠️ NEW: Listen for socket connect để đảm bảo listeners được đăng ký lại nếu reconnect
    // socket.on('connect', () => {
    //   socket.on('drive_mindmap:task_status_updated', handleRealtimeTaskStatusUpdate)
    //   // socket.on('drive_mindmap:updated', handleRealtimeMindmapUpdate)
    //   socket.on('drive_mindmap:node_updated', handleRealtimeNodeUpdate)
    //   socket.on('drive_mindmap:nodes_updated_batch', handleRealtimeNodesBatchUpdate)
    //   socket.on('drive_mindmap:nodes_deleted', handleRealtimeNodesDeleted)
    // })
    
    
  } else {
    console.warn('⚠️ Socket is not available, realtime updates will not work')
  }

  window.addEventListener("click", handleClickOutside, true)
  window.addEventListener("paste", handlePasteEvent, true)
  
  window.addEventListener('beforeunload', handleBeforeUnload)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown, true)
  window.removeEventListener('compositionstart', handleCompositionStart, true)
  window.removeEventListener('compositionend', handleCompositionEnd, true)
  window.removeEventListener('copy', handleCopy, true)
  window.removeEventListener('hashchange', scrollToNodeFromHash)
  window.removeEventListener('resize', () => { })
  
  // ⚠️ FIX: Cleanup network status listeners
  if (window.__mindmapOnlineHandler) {
    window.removeEventListener('online', window.__mindmapOnlineHandler)
    delete window.__mindmapOnlineHandler
  }
  if (window.__mindmapOfflineHandler) {
    window.removeEventListener('offline', window.__mindmapOfflineHandler)
    delete window.__mindmapOfflineHandler
  }

  if (d3Renderer) {
    d3Renderer.destroy()
    d3Renderer = null
  }

  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveImmediately()
  }
  
  if (textInputSaveTimeout) {
    clearTimeout(textInputSaveTimeout)
    saveImmediately()
    textInputSaveTimeout = null
  }
  
  if (textInputSnapshotTimeout) {
    clearTimeout(textInputSnapshotTimeout)
    saveSnapshot()
    textInputSnapshotTimeout = null
  }
  
  if (formattingSnapshotTimeout) {
    clearTimeout(formattingSnapshotTimeout)
    saveSnapshot()
    formattingSnapshotTimeout = null
  }
  // ⚠️ NEW: Cleanup socket listeners với safety check
  if (socket) {
    socket.off('drive_mindmap:task_status_updated', handleRealtimeTaskStatusUpdate)
    socket.off("permission_revoked", handleSocketPermissionRevoked)
    socket.off("connect")
    socket.off('drive_mindmap:updated', handleRealtimeMindmapUpdate)
    socket.off('drive_mindmap:node_updated', handleRealtimeNodeUpdate)
    socket.off('drive_mindmap:nodes_updated_batch', handleRealtimeNodesBatchUpdate)
    socket.off('drive_mindmap:nodes_deleted', handleRealtimeNodesDeleted)
    socket.off('drive_mindmap:node_editing', handleRealtimeNodeEditing)
    socket.off('drive_mindmap:collapsed_nodes_updated') // ⚠️ FIX: Cleanup collapsed nodes listener
  }
  socket.off('drive_mindmap:new_comment', handleRealtimeNewComment)
  socket.off('drive_mindmap:comment_deleted', handleRealtimeDeleteOneComment)
  socket.off('drive_mindmap:node_resolved', handleRealtimeResolvedComment)
  socket.off('drive_mindmap:node_unresolved', handleRealtimeUnresolvedComment)
  
  // ⚠️ NEW: Cleanup tất cả editing states của user khi component unmount
  if (nodeEditingUsers.value.size > 0 || editingNode.value) {
    try {
      cleanupEditingResource.submit({
        entity_name: props.entityName
      })
      console.log('[Editing] 🧹 Cleaned up editing states on unmount')
    } catch (error) {
      console.error('[Editing] ❌ Error cleaning up editing states:', error)
    }
  }
  
  // ⚠️ FIX: Vẫn broadcast stop editing cho node hiện tại (backward compatibility)
  if (editingNode.value) {
    broadcastNodeEditing(editingNode.value, false)
  }
  
  lastBroadcastState.value.clear()

  window.removeEventListener("click", handleClickOutside, true)
  window.removeEventListener("paste", handlePasteEvent, true)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  // ⭐ Clear permission modal timer
  cleanupPermissions()
})




// Clipboard functions (wrapper for composable + additional operations)

function copyNode(nodeId) {
  const result = copyNodeFromComposable(nodeId)
  if (!result) return

  clipboard.value = {
    type: 'subtree',
    operation: 'copy',
    rootNodeId: result.rootId,
    nodes: result.nodes.map(n => ({
      id: n.id,
      data: {
        label: n.data?.label || '',
        fixedWidth: n.data?.fixedWidth,
        fixedHeight: n.data?.fixedHeight,
        width: result.nodeSizes[n.id]?.width,
        height: result.nodeSizes[n.id]?.height,
        completed: n.data?.completed || false,
      }
    })),
    edges: result.edges.map(e => ({
      source: e.source,
      target: e.target
    }))
  }
}

function cutNode(nodeId) {
  if (!permissions.value.write) {
    toast.error("Bạn không có quyền chỉnh sửa")
    return
  }
  
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node || nodeId === 'root') return

  const result = copyNodeFromComposable(nodeId)
  if (!result) return

  clipboard.value = {
    type: 'subtree',
    operation: 'cut',
    rootNodeId: result.rootId,
    nodes: result.nodes.map(n => ({
      id: n.id,
      data: {
        label: n.data?.label || '',
        fixedWidth: n.data?.fixedWidth,
        fixedHeight: n.data?.fixedHeight,
        width: result.nodeSizes[n.id]?.width,
        height: result.nodeSizes[n.id]?.height,
        completed: n.data?.completed || false,
      }
    })),
    edges: result.edges.map(e => ({
      source: e.source,
      target: e.target
    }))
  }

  performDelete(nodeId)
}

function copyText(text) {
  if (!text || text.trim() === '') return
  clipboard.value = {
    type: 'text',
    data: text
  }
}

function copyNodeLink(nodeId) {
  if (!nodeId || nodeId === 'root') return

  // Tạo link với hash (#nodeId)
  const currentUrl = window.location.href.split('#')[0] // Lấy URL hiện tại không có hash
  const link = `${currentUrl}#node-${nodeId}`

  // Copy vào clipboard
  navigator.clipboard.writeText(link).then(() => {
    

    // Hiển thị thông báo (optional - có thể thêm toast notification)
    // Có thể dùng một toast library hoặc tạo notification đơn giản
  }).catch(err => {
    

    // Fallback: dùng cách cũ
    const textArea = document.createElement('textarea')
    textArea.value = link
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    try {
      document.execCommand('copy')
      
    } catch (err) {
      
    }
    document.body.removeChild(textArea)
  })
}

function pasteToNode(targetNodeId) {
  if (!permissions.value.write) {
    toast.error("Bạn không có quyền chỉnh sửa")
    return
  }
  
  if (!hasClipboard.value || !targetNodeId) return

  const targetNode = nodes.value.find(n => n.id === targetNodeId)
  if (!targetNode) return

  const isEditing = editingNode.value === targetNodeId
  const editorInstance = d3Renderer?.getEditorInstance?.(targetNodeId)

  if (isEditing && editorInstance && clipboard.value.type === 'text') {
    return
  }

  if (clipboard.value.type === 'subtree' && clipboard.value.nodes && clipboard.value.edges) {
    const rootNodeId = clipboard.value.rootNodeId

    if (clipboard.value.operation === 'cut' && targetNodeId === rootNodeId) {
      return
    }

    const nodeIdMap = new Map()
    clipboard.value.nodes.forEach((node) => {
      const newId = generateNodeId()
      nodeIdMap.set(node.id, newId)
    })

    const newNodes = clipboard.value.nodes.map(node => {
      const newNodeId = nodeIdMap.get(node.id)
      let parentId = null
      
      if (node.id === rootNodeId) {
        parentId = targetNodeId
      } else {
        const parentEdge = clipboard.value.edges.find(e => e.target === node.id)
        if (parentEdge) {
          parentId = nodeIdMap.get(parentEdge.source)
        }
      }

      return {
        id: newNodeId,
        data: {
          label: node.data?.label || '',
          parentId: parentId,
          completed: node.data?.completed || false,
          ...(node.data?.fixedWidth && node.data?.fixedHeight ? {
            fixedWidth: node.data.fixedWidth,
            fixedHeight: node.data.fixedHeight
          } : node.data?.width && node.data?.height ? {
            fixedWidth: node.data.width,
            fixedHeight: node.data.height
          } : {})
        }
      }
    })

    const newEdges = clipboard.value.edges.map(edge => {
      const newSourceId = nodeIdMap.get(edge.source)
      const newTargetId = nodeIdMap.get(edge.target)
      return {
        id: `edge-${newSourceId}-${newTargetId}`,
        source: newSourceId,
        target: newTargetId
      }
    })

    const newRootNodeId = nodeIdMap.get(rootNodeId)
    const rootEdge = {
      id: `edge-${targetNodeId}-${newRootNodeId}`,
      source: targetNodeId,
      target: newRootNodeId
    }

    newNodes.forEach(node => {
      nodeCreationOrder.value.set(node.id, creationOrderCounter++)
      changedNodeIds.value.add(node.id)
    })

    elements.value = [
      ...nodes.value,
      ...newNodes,
      ...edges.value,
      ...newEdges,
      rootEdge
    ]

    selectedNode.value = newNodes.find(n => n.id === newRootNodeId)

    if (d3Renderer) {
      d3Renderer.selectedNode = newRootNodeId
      // Clear size cache cho nodes mới
      newNodes.forEach(node => {
        d3Renderer.nodeSizeCache?.delete(node.id)
      })
    }

    if (clipboard.value.operation === 'cut') {
      clipboard.value = null
    }

    // Update D3 renderer để hiển thị nodes mới
    updateD3RendererWithDelay(50)

    nextTick(() => {
      setTimeout(() => {
        newNodes.forEach(newNode => {
          if (newNode.data?.completed) {
            setTimeout(() => {
              const editorInstance = d3Renderer?.getEditorInstance?.(newNode.id)
              if (editorInstance) {
                applyStrikethroughToTitle(editorInstance, true)
              }
            }, 100)
          }
        })
      }, 100)
    })

    nextTick(() => {
      setTimeout(() => {
        const nodeGroup = d3Renderer?.g?.select(`[data-node-id="${newRootNodeId}"]`)
        if (nodeGroup && !nodeGroup.empty()) {
          setTimeout(() => {
            const editorInstance = d3Renderer?.getEditorInstance?.(newRootNodeId)
            if (editorInstance) {
              editorInstance.commands.focus('end')
            }
          }, 200)
        }
      }, 30)
    })

    saveSnapshot()
    scheduleSave()
    return
  }

  const newNodeId = generateNodeId()
  let newNodeLabel = 'Nhánh mới'
  let newNodeFixedWidth = null
  let newNodeFixedHeight = null
  let newNodeCompleted = false
  
  if (clipboard.value.type === 'node') {
    newNodeLabel = clipboard.value.data.label || 'Nhánh mới'
    newNodeCompleted = clipboard.value.data.completed || false
    if (clipboard.value.data.width && clipboard.value.data.height) {
      newNodeFixedWidth = clipboard.value.data.width
      newNodeFixedHeight = clipboard.value.data.height
    }
  } else if (clipboard.value.type === 'text') {
    newNodeLabel = clipboard.value.data || 'Nhánh mới'
  }

  const newNode = {
    id: newNodeId,
    data: {
      label: newNodeLabel,
      parentId: targetNodeId,
      completed: newNodeCompleted,
      ...(newNodeFixedWidth && newNodeFixedHeight ? {
        fixedWidth: newNodeFixedWidth,
        fixedHeight: newNodeFixedHeight
      } : {})
    }
  }

  const newEdge = {
    id: `edge-${targetNodeId}-${newNodeId}`,
    source: targetNodeId,
    target: newNodeId
  }

  nodeCreationOrder.value.set(newNodeId, creationOrderCounter++)
  changedNodeIds.value.add(newNodeId)

  elements.value = [
    ...nodes.value,
    newNode,
    ...edges.value,
    newEdge
  ]

  selectedNode.value = newNode

  if (d3Renderer) {
    d3Renderer.selectedNode = newNodeId
    d3Renderer.nodeSizeCache?.delete(newNodeId)
  }

  // Update D3 renderer để hiển thị node mới
  updateD3RendererWithDelay(50)

  if (newNodeCompleted) {
    nextTick(() => {
      setTimeout(() => {
        const editorInstance = d3Renderer?.getEditorInstance?.(newNodeId)
        if (editorInstance) {
          applyStrikethroughToTitle(editorInstance, true)
        }
      }, 100)
    })
  }

  nextTick(() => {
    setTimeout(() => {
      if (d3Renderer) {
        scrollToNode(d3Renderer, newNodeId)
      }
      const nodeGroup = d3Renderer?.g?.select(`[data-node-id="${newNodeId}"]`)
      if (nodeGroup && !nodeGroup.empty()) {
        setTimeout(() => {
          const editorInstance = d3Renderer?.getEditorInstance?.(newNodeId)
          if (editorInstance) {
            editorInstance.commands.focus('end')
          }
        }, 200)
      }
    }, 30)
  })

  saveSnapshot()
  scheduleSave()
}

async function pasteFromSystemClipboard(targetNodeId) {
  if (!permissions.value.write) {
    toast.error("Bạn không có quyền chỉnh sửa")
    return
  }
  
  if (!targetNodeId) return

  try {
    const text = await navigator.clipboard.readText()
    if (!text || text.trim() === '') return

    const newNodeId = generateNodeId()
    const newNode = {
      id: newNodeId,
      data: {
        label: text.trim(),
        parentId: targetNodeId
      }
    }

    const newEdge = {
      id: `edge-${targetNodeId}-${newNodeId}`,
      source: targetNodeId,
      target: newNodeId
    }

    nodeCreationOrder.value.set(newNodeId, creationOrderCounter++)
    changedNodeIds.value.add(newNodeId)

    elements.value = [
      ...nodes.value,
      newNode,
      ...edges.value,
      newEdge
    ]

    selectedNode.value = newNode

    if (d3Renderer) {
      d3Renderer.selectedNode = newNodeId
      d3Renderer.nodeSizeCache.delete(newNodeId)
      
      // ⚠️ Force re-render để hiển thị node mới ngay lập tức
      nextTick(() => {
        d3Renderer.setData(nodes.value, edges.value, nodeCreationOrder.value)
        d3Renderer.render()
        
        setTimeout(() => {
          scrollToNode(d3Renderer, newNodeId)
          
          const nodeGroup = d3Renderer?.g?.select(`[data-node-id="${newNodeId}"]`)
          if (nodeGroup && !nodeGroup.empty()) {
            setTimeout(() => {
              const editorInstance = d3Renderer?.getEditorInstance?.(newNodeId)
              if (editorInstance) {
                editorInstance.commands.focus('end')
              }
            }, 200)
          }
        }, 30)
      })
    }

    saveSnapshot()
    await nextTick()
    saveNode(newNodeId)
  } catch (error) {
    console.error('Paste from system clipboard failed:', error)
  }
}

// UI action functions moved to useMindmapUIActions composable

// ⚠️ NEW: Handle paste event từ clipboard hệ thống
function handlePasteEvent(event) {
  // Kiểm tra xem có đang trong editor không
  const isInEditor = event.target?.closest('.mindmap-node-editor') ||
    event.target?.closest('.ProseMirror') ||
    event.target?.closest('.mindmap-editor-prose')

  if (isInEditor) {
    // Nếu đang trong editor, cho phép paste text bình thường (TipTap sẽ xử lý)
    return
  }

  // Kiểm tra xem có đang focus vào input/textarea không
  const isInInput = event.target?.tagName === 'INPUT' ||
    event.target?.tagName === 'TEXTAREA' ||
    event.target?.isContentEditable

  if (isInInput) {
    // Nếu đang trong input/textarea, cho phép paste bình thường
    return
  }

  // Chỉ xử lý paste nếu có node được chọn và không có clipboard của mindmap
  if (selectedNode.value && !hasClipboard.value) {
    event.preventDefault()
    event.stopPropagation()

    // Đọc text từ clipboard event
    const clipboardData = event.clipboardData || window.clipboardData
    if (clipboardData) {
      const text = clipboardData.getData('text/plain')
      if (text && text.trim()) {
        // Tạo node mới với nội dung từ clipboard
        const newNodeId = generateNodeId()
        const newNode = {
          id: newNodeId,
          data: {
            label: text.trim(),
            parentId: selectedNode.value.id
          }
        }

        const newEdge = {
          id: `edge-${selectedNode.value.id}-${newNodeId}`,
          source: selectedNode.value.id,
          target: newNodeId
        }

        // Store creation order
        nodeCreationOrder.value.set(newNodeId, creationOrderCounter++)
        changedNodeIds.value.add(newNodeId)

        // Add node and edge
        elements.value = [
          ...nodes.value,
          newNode,
          ...edges.value,
          newEdge
        ]

        selectedNode.value = newNode

        if (d3Renderer) {
          d3Renderer.selectedNode = newNodeId
          d3Renderer.nodeSizeCache?.delete(newNodeId)
        }
        // Auto-focus new node's editor
        nextTick(() => {
          void document.body.offsetHeight
          setTimeout(() => {
            if (d3Renderer) {
              scrollToNodeWithRetry(newNodeId)
            }
            const nodeGroup = d3Renderer?.g?.select(`[data-node-id="${newNodeId}"]`)
            if (nodeGroup && !nodeGroup.empty()) {
              setTimeout(() => {
                const editorInstance = d3Renderer?.getEditorInstance?.(newNodeId)
                if (editorInstance) {
                  editorInstance.commands.focus('end')
                }
              }, 200)
            }
          }, 30)
        })

        saveSnapshot()
        nextTick(() => {
          saveNode(newNodeId)
        })
      }
    }
  }
}


// Handle toolbar done (toggle completed status)

// Handle toolbar comments
function handleToolbarComments({ node, show }) {
  const isSameNode =
    activeCommentNode.value &&
    node &&
    activeCommentNode.value.id === node.id

  // Đóng panel
  if (isSameNode) {
    activeCommentNode.value = null
    return
  }

  // Mở panel (node mới hoặc chưa mở)
  openCommentPanel(node, { focus: true })
}


// Handle toolbar more options (hover)
function handleToolbarMoreOptions({ node }) {
  // Chỉ cần node để hiển thị menu trong toolbar
  // Menu sẽ được render trực tiếp trong toolbar popup
}

// Handle toolbar context action
function handleToolbarContextAction({ type, node }) {
  if (!node) return

  // Xử lý action giống như handleContextMenuAction
  handleContextMenuAction({ type, node })
}

// Handle insert image
async function handleInsertImage({ node }) {
  

  if (!node) {
    
    return
  }

  // ⚠️ FIX: Đợi editor instance sẵn sàng nếu chưa có (khi tạo node mới)
  if (!currentEditorInstance.value) {
    
    
    // Đảm bảo node được render trước
    if (d3Renderer && node.id) {
      // Force update renderer để đảm bảo node được render
      await nextTick()
      void document.body.offsetHeight
      
      // Trigger render
      requestAnimationFrame(() => {
        if (d3Renderer) {
          d3Renderer.render()
        }
      })
      
      // Đợi một chút để render hoàn tất
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Đợi editor instance được mount (tối đa 3 giây)
    let attempts = 0
    const maxAttempts = 60 // 60 * 50ms = 3 giây
    
    while (attempts < maxAttempts) {
      // Kiểm tra xem editor instance đã sẵn sàng chưa
      const editor = d3Renderer?.getEditorInstance(node.id) || currentEditorInstance.value
      
      if (editor && editor.view) {
        
        break
      }
      
      // Mỗi 10 lần thử, trigger lại render để đảm bảo node được mount
      if (attempts % 10 === 0 && d3Renderer) {
        requestAnimationFrame(() => {
          if (d3Renderer) {
            d3Renderer.render()
          }
        })
      }
      
      await new Promise(resolve => setTimeout(resolve, 50))
      attempts++
    }
    
    // Kiểm tra lại editor instance - đảm bảo computed property đã được cập nhật
    await nextTick() // Đợi Vue cập nhật computed property
    
    const finalEditor = d3Renderer?.getEditorInstance(node.id) || currentEditorInstance.value
    
    if (!finalEditor || !finalEditor.view) {
      return
    }
    
    // Đảm bảo currentEditorInstance computed đã được cập nhật
    if (!currentEditorInstance.value && finalEditor) {
      // Nếu computed chưa cập nhật, đợi thêm một chút
      await new Promise(resolve => setTimeout(resolve, 50))
      await nextTick()
    }
    
    // Đảm bảo editor được focus để sẵn sàng nhận input
    if (finalEditor && finalEditor.view && !finalEditor.view.focused) {
      try {
        finalEditor.commands.focus()
      } catch (e) {
        
      }
    }
  }

  // Tạo input file element
  const input = document.createElement('input')
  input.type = 'file'
  // ⚠️ FIX: Chỉ định rõ các định dạng ảnh được phép, không dùng image/* để tránh chọn "Tất cả tệp tin"
  input.accept = '.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg'
  input.style.display = 'none' // Ẩn input element

  // Append vào body để đảm bảo dialog hiển thị đúng
  document.body.appendChild(input)

  

  const savedSelectedNode = selectedNode.value
  
  input.onchange = async (e) => {
    const file = e.target.files?.[0]

    if (input.parentNode) {
      input.parentNode.removeChild(input)
    }
    
    if (savedSelectedNode && !selectedNode.value) {
      selectedNode.value = savedSelectedNode
      if (d3Renderer) {
        d3Renderer.selectNode(savedSelectedNode.id, true)
      }
    }

    if (!file) return

    // ⚠️ CRITICAL: Validate file type để đảm bảo chỉ upload ảnh
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml']
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']
    const fileName = file.name.toLowerCase()
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'))
    const isValidType = allowedTypes.includes(file.type) || allowedExtensions.includes(fileExtension)
    
    if (!isValidType) {
      toast({ 
        title: "Chỉ được phép tải lên file ảnh (JPG, PNG, GIF, WEBP, BMP, SVG)", 
        indicator: "red" 
      })
      // Clear flag nếu file không hợp lệ
      if (typeof window !== 'undefined') {
        window.__isUploadingImage = false
        window.__uploadingImageNodeId = null
      }
      return
    }

    // ⚠️ CRITICAL: Lưu node.id và editor instance trước khi upload
    const nodeId = node.id
    
    // ⚠️ FIX: Set flag để skip lưu snapshot khi blur/focus lại editor sau khi upload ảnh
    if (typeof window !== 'undefined') {
      window.__isUploadingImage = true
      window.__uploadingImageNodeId = nodeId
    }
    
    let editorBeforeUpload = currentEditorInstance.value || (d3Renderer?.getEditorInstance(nodeId))
    
    

    try {
      // Upload ảnh lên drive mindmap
      const imageUrl = await uploadImageToMindmap(file, props.team, props.entityName, mindmap.data?.is_private)

      // Đợi một chút để đảm bảo upload hoàn tất
      await nextTick()

      // ⚠️ FIX: Lấy lại editor instance sau khi upload - thử nhiều cách
      let editor = currentEditorInstance.value
      
      // Nếu computed property không có, thử lấy trực tiếp từ d3Renderer
      if (!editor || !editor.view) {
        
        editor = d3Renderer?.getEditorInstance(nodeId)
      }
      
      // Nếu vẫn không có, đợi một chút và thử lại
      if (!editor || !editor.view) {
        
        let attempts = 0
        const maxAttempts = 20 // 20 * 50ms = 1 giây
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 50))
          editor = currentEditorInstance.value || d3Renderer?.getEditorInstance(nodeId)
          if (editor && editor.view) {
            
            break
          }
          attempts++
        }
      }
      
      if (!editor || !editor.view) {
        // Clear flag nếu không có editor
        if (typeof window !== 'undefined') {
          window.__isUploadingImage = false
          window.__uploadingImageNodeId = null
        }
        return
      }
      
      

      // Chèn ảnh vào editor
      if (imageUrl) {
        

        // ⚠️ CRITICAL: Sử dụng editor đã lấy được (có thể từ d3Renderer trực tiếp)
        // Đảm bảo editor vẫn còn hợp lệ
        if (!editor || !editor.view) {
          // Thử lấy lại một lần nữa
          editor = currentEditorInstance.value || d3Renderer?.getEditorInstance(nodeId)
        }
        
        if (!editor || !editor.view) {
          
          return
        }

        // Sử dụng requestAnimationFrame để đảm bảo editor đã sẵn sàng
        requestAnimationFrame(() => {
          // Lấy lại editor một lần nữa trong requestAnimationFrame để đảm bảo
          let currentEditor = currentEditorInstance.value || d3Renderer?.getEditorInstance(nodeId)
          
          // Nếu vẫn không có, sử dụng editor đã lấy được trước đó
          if (!currentEditor || !currentEditor.view) {
            currentEditor = editor
          }
          
          if (!currentEditor || !currentEditor.view) {
            
            return
          }

          try {
            // Tìm vị trí chèn ảnh: giữa title (paragraph) và mô tả (blockquote)
            const { state } = currentEditor.view
            const { doc } = state

            // Tìm blockquote đầu tiên trong document
            let blockquoteOffset = null
            // Tìm paragraph cuối cùng không nằm trong blockquote (title cuối cùng)
            let lastTitleParagraphOffset = null
            let lastTitleParagraphSize = 0
            // ⚠️ FIX: Tìm ảnh cuối cùng sau title (không nằm trong blockquote)
            let lastImageEndPos = null

            // ⚠️ FIX: Sử dụng descendants để duyệt tất cả node (bao gồm cả node con)
            doc.descendants((node, pos) => {
              // Tìm blockquote đầu tiên
              if (node.type.name === 'blockquote' && blockquoteOffset === null) {
                blockquoteOffset = pos
              }
              
              // Tìm paragraph cuối cùng không nằm trong blockquote
              if (node.type.name === 'paragraph') {
                // Kiểm tra xem paragraph có nằm trong blockquote không
                const resolvedPos = state.doc.resolve(pos)
                let inBlockquote = false
                
                for (let i = resolvedPos.depth; i > 0; i--) {
                  const nodeAtDepth = resolvedPos.node(i)
                  if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
                    inBlockquote = true
                    break
                  }
                }
                
                // Nếu không nằm trong blockquote, đây là title paragraph
                if (!inBlockquote) {
                  const paragraphEnd = pos + node.nodeSize
                  if (lastTitleParagraphOffset === null || paragraphEnd > (lastTitleParagraphOffset + lastTitleParagraphSize)) {
                    lastTitleParagraphOffset = pos
                    lastTitleParagraphSize = node.nodeSize
                  }
                }
              }
              
              // ⚠️ FIX: Tìm ảnh sau title paragraphs (không phải blockquote)
              if (node.type.name === 'image') {
                const resolvedPos = state.doc.resolve(pos)
                let inBlockquote = false
                
                for (let i = resolvedPos.depth; i > 0; i--) {
                  const nodeAtDepth = resolvedPos.node(i)
                  if (nodeAtDepth && nodeAtDepth.type.name === 'blockquote') {
                    inBlockquote = true
                    break
                  }
                }
                
                // Nếu không phải blockquote, đó là ảnh sau title
                if (!inBlockquote) {
                  const imageEnd = pos + node.nodeSize
                  if (lastImageEndPos === null || imageEnd > lastImageEndPos) {
                    lastImageEndPos = imageEnd
                  }
                }
              }
            })

            let insertPosition = null

            if (blockquoteOffset !== null) {
              // Có blockquote: chèn ảnh vào giữa title và blockquote
              // ⚠️ FIX: Ưu tiên chèn sau ảnh cuối cùng nếu có
              if (lastImageEndPos !== null) {
                // Có ảnh đã tồn tại, chèn sau ảnh cuối cùng (trước blockquote)
                insertPosition = lastImageEndPos
              } else if (lastTitleParagraphOffset !== null) {
                // Chèn ảnh sau paragraph cuối cùng của title (trước blockquote)
                insertPosition = lastTitleParagraphOffset + lastTitleParagraphSize
              } else {
                // Không có title paragraph: chèn ảnh vào trước blockquote
                insertPosition = blockquoteOffset
              }
            } else {
              // Không có blockquote: chèn ảnh sau paragraph cuối cùng của title
              // ⚠️ FIX: Ưu tiên chèn sau ảnh cuối cùng nếu có
              if (lastImageEndPos !== null) {
                // Có ảnh đã tồn tại, chèn sau ảnh cuối cùng
                insertPosition = lastImageEndPos
              } else if (lastTitleParagraphOffset !== null) {
                insertPosition = lastTitleParagraphOffset + lastTitleParagraphSize
              } else {
                // Không có title paragraph: chèn ảnh vào cuối document
                insertPosition = doc.content.size
              }
            }

            // Kiểm tra xem editor có command setImage không
            if (currentEditor.commands && typeof currentEditor.commands.setImage === 'function') {
              
              // Set selection tại vị trí chèn
              currentEditor.chain()
                .setTextSelection(insertPosition)
                .focus()
                .setImage({ src: imageUrl, alt: file.name || 'Image' })
                .run()
              
            } else {
              
              // Fallback: dùng insertContent với HTML
              // Escape URL để tránh lỗi khi có ký tự đặc biệt
              const escapedUrl = imageUrl.replace(/&/g, '&amp;')
              currentEditor.chain()
                .setTextSelection(insertPosition)
                .focus()
                .insertContent(`<img src="${escapedUrl}" alt="${file.name || 'Image'}" />`)
                .run()
              
            }

            // ⚠️ CRITICAL: Đợi ảnh mới được render vào DOM, rồi đợi tất cả ảnh load xong
            // Lưu số lượng ảnh ban đầu để phát hiện ảnh mới
            const editorDOM = currentEditor.view.dom
            const initialImageCount = editorDOM.querySelectorAll('img').length
            
            // Đợi cho đến khi ảnh mới xuất hiện trong DOM (tối đa 1 giây)
            let checkAttempts = 0
            const maxCheckAttempts = 20 // 20 * 50ms = 1 giây
            const checkForNewImage = setInterval(() => {
              checkAttempts++
              const currentImages = editorDOM.querySelectorAll('img')
              const currentImageCount = currentImages.length
              
              // Nếu số lượng ảnh tăng lên (có ảnh mới) hoặc đã đợi đủ lâu
              if (currentImageCount > initialImageCount || checkAttempts >= maxCheckAttempts) {
                clearInterval(checkForNewImage)
                
                const images = Array.from(currentImages)
                
                
                // Tạo promises cho tất cả ảnh (bao gồm ảnh mới vừa chèn)
                const imagePromises = images.map((img, index) => {
                  if (img.complete && img.naturalHeight > 0) {
                    return Promise.resolve()
                  }
                  
                  return new Promise((resolve) => {
                    const onLoad = () => resolve()
                    const onError = () => resolve() // Resolve ngay cả khi lỗi để không block
                    
                    img.addEventListener('load', onLoad, { once: true })
                    img.addEventListener('error', onError, { once: true })
                    
                    // Timeout sau 3 giây để không block quá lâu
                    setTimeout(() => {
                      img.removeEventListener('load', onLoad)
                      img.removeEventListener('error', onError)
                      resolve()
                    }, 3000)
                  })
                })
                
                // Đợi tất cả ảnh load xong (hoặc timeout)
                Promise.all(imagePromises).then(() => {
                  
                  
                  // Đợi thêm một chút để đảm bảo DOM đã được cập nhật hoàn toàn
                  setTimeout(() => {
                    
                    try {
                      // ⚠️ CRITICAL: Trigger blur editor để gọi handleEditorBlur
                      // handleEditorBlur sẽ cập nhật chính xác height của node
                      if (d3Renderer && nodeId) {
                        
                        const editor = d3Renderer.getEditorInstance(nodeId)
                        
                        if (editor) {
                          
                          // ⚠️ FIX: Đảm bảo node được thêm vào changedNodeIds trước khi blur
                          // Điều này đảm bảo khi upload nhiều ảnh liên tiếp, node luôn được đánh dấu để save
                          changedNodeIds.value.add(nodeId)
                          
                          // Blur editor → trigger handleEditorBlur → cập nhật height
                          editor.commands.blur()
                          
                          // ⚠️ FIX: Đảm bảo node vẫn còn trong changedNodeIds sau khi blur
                          // và trigger save ngay lập tức để đảm bảo socket được bắn
                          setTimeout(() => {
                            changedNodeIds.value.add(nodeId)
                            saveImmediately()
                          }, 200) // Đợi handleEditorBlur hoàn tất
                          
                          // Sau đó focus lại để người dùng có thể tiếp tục edit
                          setTimeout(() => {
                            editor.commands.focus('end')
                            
                            // ⚠️ FIX: Clear flag sau khi focus lại để cho phép lưu snapshot bình thường
                            setTimeout(() => {
                              if (typeof window !== 'undefined') {
                                window.__isUploadingImage = false
                                window.__uploadingImageNodeId = null
                              }
                            }, 200) // Đợi một chút để đảm bảo focus đã hoàn tất
                          }, 100)
                        } else {
                          console.error('[ERROR handleInsertImage] editor is null for node:', nodeId)
                          // Clear flag nếu có lỗi
                          if (typeof window !== 'undefined') {
                            window.__isUploadingImage = false
                            window.__uploadingImageNodeId = null
                          }
                        }
                      } else {
                        console.error('[ERROR handleInsertImage] d3Renderer or nodeId is null')
                        // Clear flag nếu có lỗi
                        if (typeof window !== 'undefined') {
                          window.__isUploadingImage = false
                          window.__uploadingImageNodeId = null
                        }
                      }
                    } catch (err) {
                      console.error('[ERROR handleInsertImage] Exception:', err)
                      // Clear flag nếu có lỗi
                      if (typeof window !== 'undefined') {
                        window.__isUploadingImage = false
                        window.__uploadingImageNodeId = null
                      }
                    }
                  }, 150) // Đợi thêm 150ms sau khi ảnh load xong
                }).catch(err => {
                  // Clear flag nếu có lỗi
                  if (typeof window !== 'undefined') {
                    window.__isUploadingImage = false
                    window.__uploadingImageNodeId = null
                  }
                  
                })
              }
            }, 50) // Kiểm tra mỗi 50ms
          } catch (err) {
            console.error('[ERROR handleInsertImage] Exception in requestAnimationFrame:', err)
            // Clear flag nếu có lỗi
            if (typeof window !== 'undefined') {
              window.__isUploadingImage = false
              window.__uploadingImageNodeId = null
            }
          }
        })
      }
    } catch (error) {
      console.error('[ERROR handleInsertImage] Exception:', error)
      // Clear flag nếu có lỗi
      if (typeof window !== 'undefined') {
        window.__isUploadingImage = false
        window.__uploadingImageNodeId = null
      }
    }
  }

  input.oncancel = () => {
    if (input.parentNode) {
      input.parentNode.removeChild(input)
    }
    
    if (savedSelectedNode && !selectedNode.value) {
      selectedNode.value = savedSelectedNode
      if (d3Renderer) {
        d3Renderer.selectNode(savedSelectedNode.id, true)
      }
    }
  }

  setTimeout(() => {
    input.click()
  }, 0)
}

// Image upload functions moved to @/utils/mindmapImageUpload

const realtimeMindmapNodes = computed(() => {
  return nodes.value.map(n => ({
    id: n.id,
    data: n.data,
    position: n.position,
    node_key: n.node_key ?? null,
    created_at: n.created_at ?? null,
  }))
})


const nodeFromQuery = computed(() => route.query.node)



// Realtime node update handler moved to useMindmapRealtimeNodes composable

function handleRealtimeMindmapUpdate(payload) {
  if (!payload) return
  
  if (payload.entity_name !== props.entityName) return
  
  const currentUser = store.state.user.id
  if (payload.modified_by === currentUser) {
    return
  }
  
  if (isSaving.value) {
    console.log('⏸️ Đang lưu, bỏ qua update từ remote')
    return
  }
  
  console.log('📡 Nhận update mindmap từ remote:', payload.modified_by)
  
  const remoteNodes = payload.nodes || []
  const remoteEdges = payload.edges || []
  
  if (!Array.isArray(remoteNodes) || !Array.isArray(remoteEdges)) {
    console.warn('⚠️ Invalid remote data format')
    return
  }
  
  const localNodesMap = new Map(nodes.value.map(n => [n.id, n]))
  const localEdgesMap = new Map(edges.value.map(e => [`${e.source}-${e.target}`, e]))
  
  const editingNodeId = editingNode.value
  const selectedNodeId = selectedNode.value?.id
  
  const updatedNodes = []
  const updatedEdges = []
  
  remoteNodes.forEach(remoteNode => {
    const localNode = localNodesMap.get(remoteNode.id)
    
    if (!localNode) {
      const newNode = { ...remoteNode }
      if (remoteNode.data?.order !== undefined) {
        if (!nodeCreationOrder.value.has(remoteNode.id)) {
          nodeCreationOrder.value.set(remoteNode.id, remoteNode.data.order)
        }
      }
      updatedNodes.push(newNode)
    } else {
      const isNodeBeingEdited = remoteNode.id === editingNodeId || remoteNode.id === selectedNodeId
      
      if (isNodeBeingEdited) {
        const mergedNode = { ...localNode }
        if (remoteNode.data && !localNode.data) {
          mergedNode.data = { ...remoteNode.data }
        } else if (remoteNode.data && localNode.data) {
          mergedNode.data = { ...localNode.data, ...remoteNode.data }
          if (localNode.data.label && remoteNode.data.label !== localNode.data.label) {
            mergedNode.data.label = localNode.data.label
          }
          if (localNode.data.order !== undefined) {
            mergedNode.data.order = localNode.data.order
          }
        }
        if (remoteNode.position && !localNode.position) {
          mergedNode.position = { ...remoteNode.position }
        } else if (remoteNode.position && localNode.position) {
          mergedNode.position = { ...localNode.position }
        }
        updatedNodes.push(mergedNode)
      } else {
        const mergedNode = { ...remoteNode }
        if (localNode.position && d3Renderer?.positions?.get(remoteNode.id)) {
          mergedNode.position = { ...localNode.position }
        }
        if (remoteNode.data?.order !== undefined) {
          if (!nodeCreationOrder.value.has(remoteNode.id)) {
            nodeCreationOrder.value.set(remoteNode.id, remoteNode.data.order)
          }
        }
        updatedNodes.push(mergedNode)
      }
    }
  })
  
  remoteEdges.forEach(remoteEdge => {
    const edgeKey = `${remoteEdge.source}-${remoteEdge.target}`
    const localEdge = localEdgesMap.get(edgeKey)
    
    if (!localEdge) {
      updatedEdges.push({ ...remoteEdge })
    } else {
      updatedEdges.push({ ...localEdge, ...remoteEdge })
    }
  })
  
  const rootNode = updatedNodes.find(n => n.id === 'root' || n.data?.isRoot)
  if (!rootNode) {
    const existingRoot = nodes.value.find(n => n.id === 'root' || n.data?.isRoot)
    if (existingRoot) {
      updatedNodes.unshift(existingRoot)
    }
  }
  
  elements.value = [...updatedNodes, ...updatedEdges]
  
  if (d3Renderer) {
    nextTick(() => {
      // ⚠️ NEW: Xóa cache kích thước của các node có nội dung thay đổi để tính toán lại
      updatedNodes.forEach(updatedNode => {
        const localNode = localNodesMap.get(updatedNode.id)
        if (localNode && localNode.data?.label !== updatedNode.data?.label) {
          // Nội dung đã thay đổi → xóa cache để tính toán lại kích thước
          d3Renderer.nodeSizeCache.delete(updatedNode.id)
        }
      })
      
      const nodesToUpdate = []
      updatedNodes.forEach(updatedNode => {
        const isNodeBeingEdited = updatedNode.id === editingNodeId || updatedNode.id === selectedNodeId
        if (!isNodeBeingEdited && updatedNode.data?.label) {
          const localNode = localNodesMap.get(updatedNode.id)
          if (localNode && localNode.data?.label !== updatedNode.data.label) {
            nodesToUpdate.push(updatedNode)
            const node = d3Renderer.nodes.find((n) => n.id === updatedNode.id)
            if (node) {
              node.data.label = updatedNode.data.label
              if (node.data.fixedWidth || node.data.fixedHeight) {
                delete node.data.fixedWidth
                delete node.data.fixedHeight
              }
              d3Renderer.nodeSizeCache.delete(updatedNode.id)
            }
          }
        }
      })
      
      d3Renderer.setData(updatedNodes, updatedEdges, nodeCreationOrder.value)
      d3Renderer.render()
      
      nodesToUpdate.forEach(updatedNode => {
            const editorInstance = d3Renderer.getEditorInstance(updatedNode.id)
            if (editorInstance && !editorInstance.isDestroyed) {
              try {
            editorInstance.commands.setContent(updatedNode.data.label, false)
                
                requestAnimationFrame(() => {
                  setTimeout(() => {
                requestAnimationFrame(() => {
                    const nodeGroup = d3Renderer.g.select(`[data-node-id="${updatedNode.id}"]`)
                    if (!nodeGroup.empty()) {
                      const rect = nodeGroup.select('.node-rect')
                      const fo = nodeGroup.select('.node-text')
                      
                      if (!rect.empty() && !fo.empty()) {
                      const editorDOM = editorInstance.view?.dom
                      const editorContent = editorDOM?.querySelector('.mindmap-editor-prose') || editorDOM
                      const isRootNode = updatedNode.data?.isRoot || updatedNode.id === 'root'
                        
                      if (editorContent) {
                        const borderOffset = 4
                        const maxWidth = 400
                        const singleLineHeight = Math.ceil(19 * 1.4) + 16
                        const currentWidth = parseFloat(rect.attr('width')) || 0
                        const currentHeight = parseFloat(rect.attr('height')) || 0
                        
                        const hasImages = updatedNode.data?.label?.includes('<img') || updatedNode.data?.label?.includes('image-wrapper')
                        
                        let newSize
                        if (hasImages) {
                          newSize = { width: maxWidth, height: singleLineHeight }
                        } else {
                          newSize = d3Renderer.estimateNodeSize(updatedNode)
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
                                htmlContent: updatedNode.data.label,
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
                                    htmlContent: updatedNode.data.label,
                                    singleLineHeight
                                  })
                                  newSize.height = heightResult.height
                                  
                          d3Renderer.nodeSizeCache.set(updatedNode.id, newSize)
                          
                                  const node = d3Renderer.nodes.find((n) => n.id === updatedNode.id)
                                  if (node) {
                                    if (!node.data) node.data = {}
                                    if (!isRootNode) {
                                      node.data.fixedWidth = newSize.width
                                      node.data.fixedHeight = newSize.height
                                    }
                                  }
                                  
                                  if (!updatedNode.data) updatedNode.data = {}
                                  if (!isRootNode) {
                                    updatedNode.data.fixedWidth = newSize.width
                                    updatedNode.data.fixedHeight = newSize.height
                                  }
                                  
                                  rect.attr('height', newSize.height)
                                  rect.node()?.setAttribute('height', newSize.height)
                                  
                                  const foHeight = Math.max(0, newSize.height - borderOffset)
                                  fo.attr('height', foHeight)
                                  fo.node()?.setAttribute('height', foHeight)
                                  
                                  if (wrapperNode) {
                                    wrapperNode.style.setProperty('height', `${foHeight}px`, 'important')
                                    wrapperNode.style.setProperty('min-height', `${foHeight}px`, 'important')
                                  }
                                  
                                  if (containerNode) {
                                    containerNode.style.setProperty('height', `${foHeight}px`, 'important')
                                    containerNode.style.setProperty('min-height', `${foHeight}px`, 'important')
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
                                  
                                  updateD3RendererWithDelay()
                                }, 20)
                              })
                              return
                            }
                          } else {
                            const contentScrollHeight = editorContent.scrollHeight || editorContent.offsetHeight || 0
                            newSize.height = Math.max(contentScrollHeight, singleLineHeight)
                          }
                          
                          d3Renderer.nodeSizeCache.set(updatedNode.id, newSize)
                          
                          const node = d3Renderer.nodes.find((n) => n.id === updatedNode.id)
                          if (node) {
                            if (!node.data) node.data = {}
                            if (!isRootNode) {
                              node.data.fixedWidth = newSize.width
                              node.data.fixedHeight = newSize.height
                            }
                          }
                          
                          if (!updatedNode.data) updatedNode.data = {}
                          if (!isRootNode) {
                            updatedNode.data.fixedWidth = newSize.width
                            updatedNode.data.fixedHeight = newSize.height
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
                          
                          updateD3RendererWithDelay()
                        }, 50)
                      } else {
                        const hasImages = updatedNode.data?.label?.includes('<img') || updatedNode.data?.label?.includes('image-wrapper')
                        const maxWidth = 400
                        const singleLineHeight = Math.ceil(19 * 1.4) + 16
                        
                        let newSize
                        if (hasImages) {
                          newSize = { width: maxWidth, height: singleLineHeight }
                        } else {
                          newSize = d3Renderer.estimateNodeSize(updatedNode)
                        }
                        
                        const node = d3Renderer.nodes.find((n) => n.id === updatedNode.id)
                        if (node) {
                          if (!node.data) node.data = {}
                          if (!isRootNode) {
                            node.data.fixedWidth = newSize.width
                            if (hasImages) {
                              setTimeout(() => {
                                const updatedSize = d3Renderer.estimateNodeSize(updatedNode)
                                node.data.fixedHeight = updatedSize.height
                                if (!updatedNode.data) updatedNode.data = {}
                                updatedNode.data.fixedWidth = updatedSize.width
                                updatedNode.data.fixedHeight = updatedSize.height
                                d3Renderer.nodeSizeCache.set(updatedNode.id, updatedSize)
                                
                                const borderOffset = 4
                                rect.attr('width', updatedSize.width)
                                rect.attr('height', updatedSize.height)
                                fo.attr('width', Math.max(0, updatedSize.width - borderOffset))
                                fo.attr('height', Math.max(0, updatedSize.height - borderOffset))
                                
                                nodeGroup.select('.add-child-btn').attr('cx', updatedSize.width + 20).attr('cy', updatedSize.height / 2)
                                nodeGroup.select('.add-child-text').attr('x', updatedSize.width + 20).attr('y', updatedSize.height / 2)
                                nodeGroup.select('.collapse-btn-number').attr('cx', updatedSize.width + 20).attr('cy', updatedSize.height / 2)
                                nodeGroup.select('.collapse-text-number').attr('x', updatedSize.width + 20).attr('y', updatedSize.height / 2)
                                nodeGroup.select('.collapse-btn-arrow').attr('cx', updatedSize.width + 20).attr('cy', updatedSize.height / 2)
                                nodeGroup.select('.collapse-arrow').attr('transform', `translate(${updatedSize.width + 20}, ${updatedSize.height / 2}) scale(0.7) translate(-12, -12)`)
                                nodeGroup.select('.collapse-button-bridge').attr('width', 20).attr('x', updatedSize.width).attr('height', updatedSize.height)
                                nodeGroup.select('.node-hover-layer').attr('width', updatedSize.width + 40).attr('height', updatedSize.height)
                                
                                updateD3RendererWithDelay()
                              }, 200)
                            } else {
                              node.data.fixedHeight = newSize.height
                            }
                          }
                        }
                        
                        if (!updatedNode.data) updatedNode.data = {}
                        if (!isRootNode) {
                          updatedNode.data.fixedWidth = newSize.width
                          if (!hasImages) {
                            updatedNode.data.fixedHeight = newSize.height
                          }
                        }
                        
                        d3Renderer.nodeSizeCache.set(updatedNode.id, newSize)
                        
                          const borderOffset = 4
                          rect.attr('width', newSize.width)
                          rect.attr('height', newSize.height)
                          fo.attr('width', Math.max(0, newSize.width - borderOffset))
                          fo.attr('height', Math.max(0, newSize.height - borderOffset))
                          
                        nodeGroup.select('.add-child-btn').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                        nodeGroup.select('.add-child-text').attr('x', newSize.width + 20).attr('y', newSize.height / 2)
                        nodeGroup.select('.collapse-btn-number').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                        nodeGroup.select('.collapse-text-number').attr('x', newSize.width + 20).attr('y', newSize.height / 2)
                        nodeGroup.select('.collapse-btn-arrow').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                          nodeGroup.select('.collapse-arrow').attr('transform', `translate(${newSize.width + 20}, ${newSize.height / 2}) scale(0.7) translate(-12, -12)`)
                        nodeGroup.select('.collapse-button-bridge').attr('width', 20).attr('x', newSize.width).attr('height', newSize.height)
                          nodeGroup.select('.node-hover-layer').attr('width', newSize.width + 40).attr('height', newSize.height)
                          
                        if (!hasImages) {
                          updateD3RendererWithDelay()
                          }
                        }
                      }
                    }
                })
                  }, 150)
                })
              } catch (err) {
                console.error('Error updating editor from remote:', err)
              }
        } else {
          d3Renderer.updateNodeLabelFromExternal(updatedNode.id, updatedNode.data.label)
          
          requestAnimationFrame(() => {
            setTimeout(() => {
              const nodeGroup = d3Renderer.g.select(`[data-node-id="${updatedNode.id}"]`)
              if (!nodeGroup.empty()) {
                const rect = nodeGroup.select('.node-rect')
                const fo = nodeGroup.select('.node-text')
                
                if (!rect.empty() && !fo.empty()) {
                  const newSize = d3Renderer.estimateNodeSize(updatedNode)
                  
                  const node = d3Renderer.nodes.find((n) => n.id === updatedNode.id)
                  if (node) {
                    if (!node.data) node.data = {}
                    const isRootNode = updatedNode.data?.isRoot || updatedNode.id === 'root'
                    if (!isRootNode) {
                      node.data.fixedWidth = newSize.width
                      node.data.fixedHeight = newSize.height
                    }
                  }
                  
                  if (!updatedNode.data) updatedNode.data = {}
                  const isRootNode = updatedNode.data?.isRoot || updatedNode.id === 'root'
                  if (!isRootNode) {
                    updatedNode.data.fixedWidth = newSize.width
                    updatedNode.data.fixedHeight = newSize.height
                  }
                  
                  d3Renderer.nodeSizeCache.set(updatedNode.id, newSize)
                  
                  const borderOffset = 4
                  rect.attr('width', newSize.width)
                  rect.attr('height', newSize.height)
                  fo.attr('width', Math.max(0, newSize.width - borderOffset))
                  fo.attr('height', Math.max(0, newSize.height - borderOffset))
                  
                  nodeGroup.select('.add-child-btn').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                  nodeGroup.select('.add-child-text').attr('x', newSize.width + 20).attr('y', newSize.height / 2)
                  nodeGroup.select('.collapse-btn-number').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                  nodeGroup.select('.collapse-text-number').attr('x', newSize.width + 20).attr('y', newSize.height / 2)
                  nodeGroup.select('.collapse-btn-arrow').attr('cx', newSize.width + 20).attr('cy', newSize.height / 2)
                  nodeGroup.select('.collapse-arrow').attr('transform', `translate(${newSize.width + 20}, ${newSize.height / 2}) scale(0.7) translate(-12, -12)`)
                  nodeGroup.select('.collapse-button-bridge').attr('width', 20).attr('x', newSize.width).attr('height', newSize.height)
                  nodeGroup.select('.node-hover-layer').attr('width', newSize.width + 40).attr('height', newSize.height)
                  
                  updateD3RendererWithDelay()
                }
              }
            }, 200)
          })
        }
      })
    })
  }
  
  if (currentView.value === 'text') {
    textViewVersion.value++
  }
}

watch(
  [nodeFromQuery, isMindmapReady],
  ([nodeId, ready]) => {
    if (isFromUI.value) return
    if (!nodeId) return
    if (nodeId === 'root') return
    if (!ready) return

    const targetNode = nodes.value.find(n => n.id === nodeId)
    if (!targetNode) return

    showPanel.value = true
    activeCommentNode.value = targetNode

    d3Renderer?.selectCommentNode(nodeId, false)
  },
  { immediate: true }
)

const textViewRef = ref(null)

watch(currentView, (next, prev) => {
  if (prev === "text" && next !== "text") {
    textViewRef.value?.forceStopEditing()
  }

  if (next === "text") {
    textViewVersion.value++
  }
})

const isStructuralMutating = ref(false)


function applyTextEdits(changes) {
  if (isStructuralMutating.value) return
  let changed = false

  console.log(">>>>>> changes:", changes);
  

  changes.forEach(({ nodeId, label }) => {
    const node = nodes.value.find(n => n.id === nodeId)
    if (!node) return

    if (node.data?.label !== label) {
      changed = true
      d3Renderer?.updateNodeLabelFromExternal(nodeId, label)
      changedNodeIds.value.add(nodeId)
      // saveNode(nodeId)
    }
  })
  saveImmediately()
}

function onOpenComment(payload) {
  const { nodeId, options = {} } = payload
  openCommentPanel(nodeId, options)
}


async function addChildToNodeTextMode(payload) {
  // Kiểm tra quyền write
  if (!permissions.value.write) {
    toast.error("Bạn không có quyền thêm node mới")
    return
  }

  const {
    anchorNodeId,
    newNodeId,
    position = "after_carpet",
    nodeId
  } = payload

  const anchorNode = nodes.value.find(n => n.id === anchorNodeId)
  if (!anchorNode) return

  let parentId
  let newOrder

  if (position === "add_root_child") {
    isStructuralMutating.value = true

    try {
      parentId = "root"

      newOrder = computeInsertAsLastRootChild({
        nodes: nodes.value,
        orderStore: nodeCreationOrder.value,
      })

      if (newOrder == null) return

      const newNode = {
        id: newNodeId,
        node_key: generateUUID(),
        created_at: Date.now(),
        data: {
          parentId,
          label: `<p>Nhánh mới</p>`,
          order: newOrder,
        },
      }

      const newEdge = {
        id: `edge-root-${newNodeId}`,
        source: "root",
        target: newNodeId,
      }

      nodeCreationOrder.value.set(newNodeId, newOrder)
      changedNodeIds.value.add(newNodeId)

      elements.value = [
        ...nodes.value,
        newNode,
        ...edges.value,
        newEdge,
      ]

      saveSnapshot()
      await nextTick()

      d3Renderer.render()
      saveNode(newNodeId)
    } finally {
      isStructuralMutating.value = false
    }

    return
  }


  if (position === "split_before") {
    isStructuralMutating.value = true

    try {
      const { anchorNodeId, newNodeId, label } = payload

      const anchorNode = nodes.value.find(n => n.id === anchorNodeId)
      if (!anchorNode) return

      const parentId = anchorNode.data.parentId ?? "root"

      const newOrder = computeInsertBeforeAnchorSplit({
        nodes: nodes.value,
        anchorNodeId,
        parentId,
        orderStore: nodeCreationOrder.value,
      })

      if (newOrder == null) return

      const newNode = {
        id: newNodeId,
        node_key: generateUUID(),
        created_at: Date.now(), 
        data: {
          parentId,
          label: `<p>Nhánh mới</p>`,
          order: newOrder,
        },
      }     

      const newEdge = {
        id: `edge-${parentId}-${newNodeId}`,
        source: parentId,
        target: newNodeId
      }

      nodeCreationOrder.value.set(newNodeId, newOrder)
      changedNodeIds.value.add(newNodeId)

      elements.value = [
        ...nodes.value,
        newNode,
        ...edges.value,
        newEdge
      ]  
    
      saveSnapshot()
      await nextTick()

      d3Renderer.render()
      saveNode(newNodeId)
    } finally {
      isStructuralMutating.value = false
    }

    return
  }


  if (position === "tab_add_child") {
    const { nodeId, anchorNodeId } = payload
    if (!nodeId || !anchorNodeId) return

    const result = moveNodeAsLastChild({
      nodeId,
      newParentId: anchorNodeId,
      nodes: nodes.value,
      orderStore: nodeCreationOrder.value,
    })

    if (!result) return

    const edge = edges.value.find(e => e.target === nodeId)
    if (edge) {
      edge.source = anchorNodeId
    }

    saveSnapshot()
    
    d3Renderer.render()
    saveNode(nodeId)
    saveNode(anchorNodeId)

    return
  }

  // ==============================
  // CASE: ADD INTO CHILD
  // ==============================
  if (position === "inside_child") {
    parentId = anchorNodeId
    newOrder = computeInsertAsFirstChild({
      nodes: nodes.value,
      parentId,
      orderStore: nodeCreationOrder.value,
    })
  }

  // ==============================
  // CASE: ADD BEFORE / AFTER
  // ==============================
  else {
    parentId = anchorNode.data.parentId
    if (!parentId) return

    if (position === "before_carpet") {
      newOrder = computeInsertBeforeAnchor({
        nodes: nodes.value,
        anchorNodeId,
        parentId,
        orderStore: nodeCreationOrder.value,
      })
    } else {
      newOrder = computeInsertAfterAnchor({
        nodes: nodes.value,
        anchorNodeId,
        parentId,
        orderStore: nodeCreationOrder.value,
      })
    }
  }

  if (newOrder == null) return

  nodeCreationOrder.value.set(newNodeId, newOrder)
  changedNodeIds.value.add(newNodeId)

  const newNode = {
    id: newNodeId,
    node_key: crypto.randomUUID(),
    created_at: Date.now(), 
    data: {
      parentId,
      label: `<p>Nhánh mới</p>`,
      order: newOrder,
    },
  }

  nodes.value.push()

  const newEdge = {
    id: `edge-${parentId}-${newNodeId}`,
    source: parentId,
    target: newNodeId
  }

  elements.value = [
    ...nodes.value,
    newNode,
    ...edges.value,
    newEdge
  ]  

  saveSnapshot()

  d3Renderer.render()
  saveNode(newNodeId)
}


function handleTextModeDone(payload) {
  const node = nodes.value.find(n => n.id === payload)
  
  if (!node) return

  handleToolbarDone(node)
}

function handleTextModeCopy(payload) {
  handleContextMenuAction({
    type: 'copy-link',
    node: nodes.value.find(n => n.id === payload),
  })
}

function handleTextModeTaskLink(payload) {
  handleContextMenuAction({
    type: 'link-task',
    node: nodes.value.find(n => n.id === payload),
  })
}

function handleTextModeDeleteNode(payload) {
  handleContextMenuAction({
    type: 'delete',
    node: nodes.value.find(n => n.id === payload),
  })
}

function handleUnlinkTaskNode(payload) {
  handleContextMenuAction({
    type: 'delete-task-link',
    node: nodes.value.find(n => n.id === payload),
  })
}

function handleInsertImagesTextMode(payload) {
  const node = nodes.value.find(n => n.id === payload)
  if (!node) return

  const oldLabel = node.data.label
  changedNodeIds.value.add(payload)

  handleInsertImage({ node })

  const unwatch = watch(
    () => node.data.label,
    (val) => {
      if (val !== oldLabel) {
        textViewVersion.value++
        unwatch()
      }
    }
  )
}
function createFocusHandler(focusFn) {
  return (node) => {
    if (!node) return

    const nodeID = node.id || node.node_id
    if (!nodeID) return

    focusFn(node)
    if(currentView.value === 'visual'){
    scrollToNodeWithRetry(nodeID)
    }else{
      textViewRef.value?.focusNodeById?.(nodeID)
    }
  }
}

const handleHighlightNode = createFocusHandler(_handleHighlightNode)
const handleSelectCommentNode = createFocusHandler(_handleSelectCommentNode)

</script>

<style scoped src="@/styles/mindmap.css"></style>
