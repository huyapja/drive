# drive/api/mindmap.py
# COPY TOÀN BỘ FILE NÀY VÀO apps/drive/drive/api/mindmap.py

import frappe
from frappe import _
import json
import html


@frappe.whitelist()
def get_mindmap_data(entity_name):
    """
    Lấy dữ liệu mindmap từ Drive File entity

    :param entity_name: Drive File entity name (NOT Drive Mindmap name)
    :return: Mindmap data
    """
    try:
        # Get Drive File
        doc_drive = frappe.get_doc("Drive File", entity_name)
        print(f"✅ Drive File: {doc_drive.name}, mindmap: {doc_drive.mindmap}")

        if not doc_drive or not doc_drive.mindmap:
            frappe.throw(_("Mindmap not found in this file"), frappe.DoesNotExistError)

        # Check permission
        if not frappe.has_permission("Drive File", "read", doc_drive):
            frappe.throw(
                _("Bạn không có quyền truy cập sơ đồ tư duy này"),
                frappe.PermissionError,
            )

        # Get Drive Mindmap document
        doc = frappe.get_doc("Drive Mindmap", doc_drive.mindmap)
        if not doc:
            frappe.throw(_("Mindmap document not found"), frappe.DoesNotExistError)

        # Parse mindmap_data
        mindmap_data = doc.mindmap_data
        if mindmap_data and isinstance(mindmap_data, str):
            try:
                mindmap_data = json.loads(mindmap_data)
            except:
                mindmap_data = None

        if mindmap_data and mindmap_data.get("nodes"):
            for node in mindmap_data.get("nodes", []):
                node_id = node.get("id")
                open_sessions = frappe.get_all(
                    "Drive Mindmap Comment Session",
                    filters={
                        "mindmap_id": doc_drive.name,
                        "node_id": node_id,
                        "is_closed": 0,
                    },
                    fields=["comment_count"],
                )

                total = sum(s.get("comment_count", 0) for s in open_sessions)

                node["count"] = total

                # ⚠️ NEW: Sync trạng thái task với node nếu có taskLink
                task_link = node.get("data", {}).get("taskLink") or node.get("taskLink")
                if task_link and task_link.get("taskId"):
                    try:
                        from drive.api.mindmap_task import get_task_status

                        task_status = get_task_status(task_link.get("taskId"))

                        if not task_status or not task_status.get("exists"):
                            # Task đã bị xóa - xóa taskLink khỏi node
                            if "data" in node and "taskLink" in node["data"]:
                                del node["data"]["taskLink"]
                            elif "taskLink" in node:
                                del node["taskLink"]
                        else:
                            # ⚠️ NEW: Kiểm tra nếu task bị hủy → không sync completed status
                            is_task_cancelled = (
                                task_status.get("status") == "Cancel"
                                or task_status.get("status") == "Cancelled"
                                or task_status.get("status_vi") == "Hủy"
                            )

                            if is_task_cancelled:
                                # Task bị hủy - không sync completed status, node hoạt động như bình thường
                                # Chỉ cập nhật status trong taskLink
                                if "data" in node and "taskLink" in node["data"]:
                                    node["data"]["taskLink"]["status"] = (
                                        task_status.get("status")
                                    )
                                elif "taskLink" in node:
                                    node["taskLink"]["status"] = task_status.get(
                                        "status"
                                    )
                                continue

                            # Cập nhật trạng thái task trong taskLink
                            is_task_completed = (
                                task_status.get("is_completed")
                                or task_status.get("status") == "Completed"
                            )

                            # ⚠️ NEW: Sync completed status với task status
                            # Nếu task đã hoàn thành → set completed = true
                            # Nếu task không còn hoàn thành → set completed = false
                            if "data" not in node:
                                node["data"] = {}

                            if is_task_completed:
                                node["data"]["completed"] = True
                            else:
                                # Task không còn hoàn thành → bỏ tick done
                                node["data"]["completed"] = False

                            # Cập nhật status trong taskLink
                            if "data" in node and "taskLink" in node["data"]:
                                node["data"]["taskLink"]["status"] = task_status.get(
                                    "status"
                                )
                            elif "taskLink" in node:
                                node["taskLink"]["status"] = task_status.get("status")
                    except Exception as e:
                        # Log error nhưng không throw để không ảnh hưởng đến việc load mindmap
                        frappe.log_error(
                            f"Error syncing task status for node {node_id}: {str(e)}",
                            "Sync Task Status",
                        )

        # ⚠️ FIX: Load collapsed nodes từ viewport_state
        collapsed_nodes = []
        if doc.viewport_state:
            try:
                viewport_data = (
                    json.loads(doc.viewport_state)
                    if isinstance(doc.viewport_state, str)
                    else doc.viewport_state
                )
                collapsed_nodes = viewport_data.get("collapsed_nodes", [])
            except:
                collapsed_nodes = []

        # ⚠️ NEW: Get current editing states from cache
        cache_key = f"mindmap_editing_{entity_name}"
        cache = frappe.cache()
        editing_states = cache.get_value(cache_key) or {}
        
        # Convert to list format for frontend
        editing_users = []
        current_user_id = frappe.session.user
        for node_id, state in editing_states.items():
            # Only return editing states from other users (not current user)
            if state.get("user_id") != current_user_id:
                editing_users.append({
                    "node_id": node_id,
                    "user_id": state.get("user_id"),
                    "user_name": state.get("user_name", ""),
                })

        return {
            "name": doc.name,
            "title": doc.title,
            "is_group": doc.is_group,
            "parent_mindmap": doc.parent_mindmap,
            "mindmap_data": mindmap_data,
            "allow_comments": doc.allow_comments,
            "allow_download": doc.allow_download,
            "color": doc.color,
            "owner": doc.owner,
            "modified_by": doc.modified_by,
            "modified": doc.modified,
            "creation": doc.creation,
            "drive_file_name": doc_drive.name,
            "is_private": doc_drive.is_private,
            "collapsed_nodes": collapsed_nodes,  # ⚠️ FIX: Trả về collapsed nodes
            "editing_users": editing_users,  # ⚠️ NEW: Trả về editing states để restore sau reload
        }

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Get Mindmap Data Error")
        frappe.throw(str(e))


@frappe.whitelist()
def save_mindmap_data(entity_name, mindmap_data, **kwargs):
    """
    Lưu dữ liệu mindmap

    :param entity_name: Drive File entity name
    :param mindmap_data: JSON string hoặc dict
    """
    try:
        # Get Drive File
        doc_drive = frappe.get_doc("Drive File", entity_name)

        if not doc_drive or not doc_drive.mindmap:
            frappe.throw(_("Mindmap not found"), frappe.DoesNotExistError)

        # Check permission
        if not frappe.has_permission("Drive File", "write", doc_drive):
            frappe.throw(_("No permission to edit"), frappe.PermissionError)

        # Get Drive Mindmap
        doc = frappe.get_doc("Drive Mindmap", doc_drive.mindmap)

        # Convert dict to JSON string
        if isinstance(mindmap_data, dict):
            mindmap_data_json = json.dumps(mindmap_data, ensure_ascii=False)
        else:
            mindmap_data_json = mindmap_data
            mindmap_data = (
                json.loads(mindmap_data)
                if isinstance(mindmap_data, str)
                else mindmap_data
            )

        doc.mindmap_data = mindmap_data_json
        doc.save(ignore_permissions=True)
        frappe.db.commit()

        nodes = mindmap_data.get("nodes", []) if isinstance(mindmap_data, dict) else []
        edges = mindmap_data.get("edges", []) if isinstance(mindmap_data, dict) else []
        layout = (
            mindmap_data.get("layout", "horizontal")
            if isinstance(mindmap_data, dict)
            else "horizontal"
        )

        message = {
            "entity_name": entity_name,
            "mindmap_id": doc.name,
            "nodes": nodes,
            "edges": edges,
            "layout": layout,
            "modified": str(doc.modified),
            "modified_by": frappe.session.user,
        }

        try:
            frappe.publish_realtime(
                event="drive_mindmap:updated",
                message=message,
                after_commit=True,
            )
        except Exception as e:
            frappe.log_error(
                f"Error emitting realtime event: {str(e)}", "Emit Mindmap Update Event"
            )

        return {
            "status": "success",
            "message": _("Mindmap saved successfully"),
            "modified": doc.modified,
        }

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Save Mindmap Data Error")
        frappe.throw(str(e))


@frappe.whitelist()
def get_mindmap_permission_status(entity_name):
    """
    Check current permission status of a mindmap file for the logged-in user
    Compares current version with cached version to detect permission changes
    Also detects if file was deleted or unshared (no read access)

    Returns:
    {
        "can_edit": bool,
        "can_read": bool,
        "permission_changed": bool,
        "unshared": bool,  # True if file was unshared (no read access)
        "deleted": bool,  # True if file was deleted
        "current_version": int,
        "cached_version": int
    }
    """
    try:
        print(f"🔍 Checking mindmap permission status for: {entity_name}")

        # Check if file exists
        if not frappe.db.exists("Drive File", entity_name):
            print(f"❌ File not found - file deleted!")
            return {
                "can_edit": False,
                "can_read": False,
                "permission_changed": True,
                "unshared": False,
                "deleted": True,
                "current_version": 0,
                "cached_version": None,
            }

        # Check basic read permission
        has_read = frappe.has_permission("Drive File", doc=entity_name, ptype="read")

        # If no read permission, file was unshared
        if not has_read:
            print(f"❌ No read permission - file unshared!")
            return {
                "can_edit": False,
                "can_read": False,
                "permission_changed": True,
                "unshared": True,
                "deleted": False,
                "current_version": 0,
                "cached_version": None,
            }

        # Get entity details
        entity = frappe.get_doc("Drive File", entity_name)

        # Check if file is active (not deleted)
        if not entity.is_active:
            print(f"❌ File is inactive - file deleted!")
            return {
                "can_edit": False,
                "can_read": False,
                "permission_changed": True,
                "unshared": False,
                "deleted": True,
                "current_version": 0,
                "cached_version": None,
            }

        # Use entity.modified as version (or create a version field if needed)
        # For now, we'll use a combination of modified timestamp and permissions
        current_version = hash(
            f"{entity.modified}_{frappe.has_permission('Drive File', doc=entity_name, ptype='write')}"
        )

        # Check edit permission
        can_edit = frappe.has_permission("Drive File", doc=entity_name, ptype="write")

        # Get cached version from session (frontend passes this)
        # We store it in session cache to detect permission changes
        cache_key = f"mindmap_version_{entity_name}_{frappe.session.user}"
        cached_version = frappe.cache().get_value(cache_key)

        if cached_version is None:
            # First check - initialize cache
            frappe.cache().set_value(
                cache_key, current_version, expires_in_sec=86400
            )  # 24 hours
            return {
                "can_edit": can_edit,
                "can_read": True,
                "permission_changed": False,
                "unshared": False,
                "deleted": False,
                "current_version": current_version,
                "cached_version": None,
            }

        # Compare versions to detect changes
        permission_changed = cached_version != current_version

        if permission_changed:
            # Update cache with new version
            frappe.cache().set_value(cache_key, current_version, expires_in_sec=86400)

        return {
            "can_edit": can_edit,
            "can_read": True,
            "permission_changed": permission_changed,
            "unshared": False,
            "deleted": False,
            "current_version": current_version,
            "cached_version": cached_version,
        }

    except Exception as e:
        frappe.log_error(
            f"❌ Error checking mindmap permission status: {str(e)}",
            "Get Mindmap Permission Status Error",
        )
        frappe.throw(str(e))


@frappe.whitelist()
def save_mindmap_layout(entity_name, nodes, edges, layout="vertical"):
    """
    Lưu custom positions từ VueFlow

    :param entity_name: Drive File entity name
    :param nodes: List of nodes with positions
    :param edges: List of edges
    :param layout: Layout type
    """
    try:
        # Get Drive File
        doc_drive = frappe.get_doc("Drive File", entity_name)

        if not doc_drive or not doc_drive.mindmap:
            frappe.throw(_("Mindmap not found"), frappe.DoesNotExistError)

        # Check permission
        if not frappe.has_permission("Drive File", "write", doc_drive):
            frappe.throw(_("No permission to edit"), frappe.PermissionError)

        # Get Drive Mindmap
        mindmap_doc = frappe.get_doc("Drive Mindmap", doc_drive.mindmap)

        # Parse if string
        if isinstance(nodes, str):
            nodes = json.loads(nodes)
        if isinstance(edges, str):
            edges = json.loads(edges)

        # Save as mindmap_data
        mindmap_data = {"nodes": nodes, "edges": edges, "layout": layout}

        mindmap_doc.mindmap_data = json.dumps(mindmap_data, ensure_ascii=False)
        mindmap_doc.save(ignore_permissions=True)
        frappe.db.commit()

        message = {
            "entity_name": entity_name,
            "mindmap_id": mindmap_doc.name,
            "nodes": nodes,
            "edges": edges,
            "layout": layout,
            "modified": str(mindmap_doc.modified),
            "modified_by": frappe.session.user,
        }

        try:
            frappe.publish_realtime(
                event="drive_mindmap:updated",
                message=message,
                after_commit=True,
            )
        except Exception as e:
            frappe.log_error(
                f"Error emitting realtime event: {str(e)}", "Emit Mindmap Update Event"
            )

        return {"success": True, "message": _("Layout saved successfully")}

    except Exception as e:
        frappe.log_error(f"Save layout error: {str(e)}", "Save Mindmap Layout")
        frappe.throw(str(e))


@frappe.whitelist()
def save_mindmap_node(entity_name, node_id, node_data, edge_data=None):
    """
    Lưu một node cụ thể trong mindmap

    :param entity_name: Drive File entity name
    :param node_id: ID của node cần cập nhật
    :param node_data: Dữ liệu node (dict hoặc JSON string)
    :param edge_data: Dữ liệu edge mới (optional, cho node mới tạo)
    """
    max_retries = 3
    retry_count = 0

    while retry_count < max_retries:
        try:
            doc_drive = frappe.get_doc("Drive File", entity_name)

            if not doc_drive or not doc_drive.mindmap:
                frappe.throw(_("Mindmap not found"), frappe.DoesNotExistError)

            if not frappe.has_permission("Drive File", "write", doc_drive):
                frappe.throw(_("No permission to edit"), frappe.PermissionError)

            mindmap_doc = frappe.get_doc("Drive Mindmap", doc_drive.mindmap)

            mindmap_doc.reload()

            if isinstance(node_data, str):
                node_data = json.loads(node_data)

            if edge_data and isinstance(edge_data, str):
                edge_data = json.loads(edge_data)

            current_data = {}
            if mindmap_doc.mindmap_data:
                current_data = (
                    json.loads(mindmap_doc.mindmap_data)
                    if isinstance(mindmap_doc.mindmap_data, str)
                    else mindmap_doc.mindmap_data
                )

            nodes = current_data.get("nodes", [])
            edges = current_data.get("edges", [])
            layout = current_data.get("layout", "horizontal")

            node_found = False
            for i, node in enumerate(nodes):
                if node.get("id") == node_id:
                    nodes[i] = node_data
                    node_found = True
                    break

            if not node_found:
                nodes.append(node_data)

            if edge_data:
                target = edge_data.get("target")
                source = edge_data.get("source")

                # Validate: check for circular reference
                if source == target:
                    frappe.log_error(
                        f"Circular edge detected: {source} -> {target}",
                        "Save Mindmap Node",
                    )
                else:
                    # ⚠️ CRITICAL: Xóa edge cũ theo target (vì khi drag & drop, edge ID thay đổi)
                    # Một node chỉ có 1 parent (1 edge đến nó), nên tìm và xóa edge cũ
                    edges[:] = [e for e in edges if e.get("target") != target]

                    # Thêm edge mới
                    edges.append(edge_data)

            mindmap_data = {"nodes": nodes, "edges": edges, "layout": layout}
            mindmap_doc.mindmap_data = json.dumps(mindmap_data, ensure_ascii=False)
            mindmap_doc.save(ignore_permissions=True)
            frappe.db.commit()

            message = {
                "entity_name": entity_name,
                "mindmap_id": mindmap_doc.name,
                "node_id": node_id,
                "node": node_data,
                "edge": edge_data,
                "modified": str(mindmap_doc.modified),
                "modified_by": frappe.session.user,
            }

            try:
                frappe.publish_realtime(
                    event="drive_mindmap:node_updated",
                    message=message,
                    after_commit=True,
                )
            except Exception as e:
                frappe.log_error(
                    f"Error emitting realtime event: {str(e)}", "Emit Node Update Event"
                )

            return {
                "success": True,
                "message": _("Node saved successfully"),
                "node": node_data,
            }

        except frappe.exceptions.TimestampMismatchError:
            retry_count += 1
            if retry_count >= max_retries:
                frappe.throw(
                    _("Không thể lưu node sau nhiều lần thử. Vui lòng thử lại.")
                )
            frappe.db.rollback()
            continue

        except Exception as e:
            frappe.log_error(f"Save node: {str(e)[:100]}", "Save Node")
            frappe.throw(str(e))


@frappe.whitelist()
def broadcast_node_editing(entity_name, node_id, is_editing):
    """
    Broadcast trạng thái editing của node đến các users khác

    :param entity_name: Drive File entity name
    :param node_id: ID của node đang được edit
    :param is_editing: True nếu bắt đầu edit, False nếu kết thúc
    """
    try:
        doc_drive = frappe.get_doc("Drive File", entity_name)

        if not doc_drive or not doc_drive.mindmap:
            return {"success": False}

        if not frappe.has_permission("Drive File", "read", doc_drive):
            return {"success": False}

        user_name = frappe.get_value("User", frappe.session.user, "full_name") or frappe.session.user

        message = {
            "entity_name": entity_name,
            "mindmap_id": doc_drive.mindmap,
            "node_id": node_id,
            "is_editing": is_editing,
            "user_id": frappe.session.user,
            "user_name": user_name,
        }

        # ⚠️ NEW: Store editing state in cache để restore sau khi reload
        cache_key = f"mindmap_editing_{entity_name}"
        cache = frappe.cache()
        
        # Get current editing states
        editing_states = cache.get_value(cache_key) or {}
        
        if is_editing:
            # Add editing state
            editing_states[node_id] = {
                "user_id": frappe.session.user,
                "user_name": user_name,
                "timestamp": frappe.utils.now(),
            }
        else:
            # Remove editing state for this user and node
            if node_id in editing_states:
                # Only remove if it's the same user
                if editing_states[node_id].get("user_id") == frappe.session.user:
                    del editing_states[node_id]
        
        # Save back to cache (expires in 5 minutes - if user doesn't send stop signal, it will auto-expire)
        cache.set_value(cache_key, editing_states, expires_in_sec=300)

        try:
            frappe.publish_realtime(
                event="drive_mindmap:node_editing",
                message=message,
            )
        except Exception as e:
            frappe.log_error(
                f"Error broadcasting editing status: {str(e)[:100]}",
                "Broadcast Editing",
            )

        return {"success": True}

    except Exception as e:
        frappe.log_error(f"Broadcast editing: {str(e)[:100]}", "Broadcast Editing")
        return {"success": False}


@frappe.whitelist()
def cleanup_user_editing_states(entity_name):
    """
    Xóa tất cả editing states của user hiện tại khỏi cache
    Được gọi khi user reload hoặc đóng tab

    :param entity_name: Drive File entity name
    """
    try:
        doc_drive = frappe.get_doc("Drive File", entity_name)

        if not doc_drive or not doc_drive.mindmap:
            return {"success": False}

        if not frappe.has_permission("Drive File", "read", doc_drive):
            return {"success": False}

        cache_key = f"mindmap_editing_{entity_name}"
        cache = frappe.cache()
        
        # Get current editing states
        editing_states = cache.get_value(cache_key) or {}
        
        # Find and remove all editing states of current user
        nodes_to_remove = []
        nodes_to_broadcast = []
        
        for node_id, state in editing_states.items():
            if state.get("user_id") == frappe.session.user:
                nodes_to_remove.append(node_id)
                nodes_to_broadcast.append({
                    "node_id": node_id,
                    "user_name": state.get("user_name", ""),
                })
        
        # Remove editing states
        for node_id in nodes_to_remove:
            del editing_states[node_id]
        
        # Save back to cache
        cache.set_value(cache_key, editing_states, expires_in_sec=300)
        
        # Broadcast stop editing for all nodes
        user_name = frappe.get_value("User", frappe.session.user, "full_name") or frappe.session.user
        
        for node_info in nodes_to_broadcast:
            try:
                message = {
                    "entity_name": entity_name,
                    "mindmap_id": doc_drive.mindmap,
                    "node_id": node_info["node_id"],
                    "is_editing": False,
                    "user_id": frappe.session.user,
                    "user_name": user_name,
                }
                
                frappe.publish_realtime(
                    event="drive_mindmap:node_editing",
                    message=message,
                )
            except Exception as e:
                frappe.log_error(
                    f"Error broadcasting cleanup editing status for node {node_info['node_id']}: {str(e)[:100]}",
                    "Cleanup Editing",
                )
        
        return {
            "success": True,
            "cleaned_nodes": len(nodes_to_remove),
        }

    except Exception as e:
        frappe.log_error(f"Cleanup editing states: {str(e)[:100]}", "Cleanup Editing")
        return {"success": False}


@frappe.whitelist()
def save_mindmap_nodes_batch(entity_name, nodes_data, edges_data=None):
    """
    Lưu nhiều nodes cùng lúc (batch operation)

    :param entity_name: Drive File entity name
    :param nodes_data: List các nodes cần lưu (JSON string hoặc list)
    :param edges_data: List các edges mới (optional, JSON string hoặc list)
    """
    max_retries = 3
    retry_count = 0

    while retry_count < max_retries:
        try:
            doc_drive = frappe.get_doc("Drive File", entity_name)

            if not doc_drive or not doc_drive.mindmap:
                frappe.throw(_("Mindmap not found"), frappe.DoesNotExistError)

            if not frappe.has_permission("Drive File", "write", doc_drive):
                frappe.throw(_("No permission to edit"), frappe.PermissionError)

            mindmap_doc = frappe.get_doc("Drive Mindmap", doc_drive.mindmap)

            mindmap_doc.reload()

            if isinstance(nodes_data, str):
                nodes_data = json.loads(nodes_data)

            if edges_data and isinstance(edges_data, str):
                edges_data = json.loads(edges_data)

            current_data = {}
            if mindmap_doc.mindmap_data:
                current_data = (
                    json.loads(mindmap_doc.mindmap_data)
                    if isinstance(mindmap_doc.mindmap_data, str)
                    else mindmap_doc.mindmap_data
                )

            nodes = current_data.get("nodes", [])
            edges = current_data.get("edges", [])
            layout = current_data.get("layout", "horizontal")

            nodes_map = {node.get("id"): i for i, node in enumerate(nodes)}

            saved_node_ids = []
            for node_data in nodes_data:
                node_id = node_data.get("id")
                if not node_id:
                    continue

                saved_node_ids.append(node_id)

                if node_id in nodes_map:
                    nodes[nodes_map[node_id]] = node_data
                else:
                    nodes.append(node_data)
                    nodes_map[node_id] = len(nodes) - 1

            if edges_data:
                # ⚠️ CRITICAL: Khi có edges_data, xóa tất cả edges cũ có target trùng với edges mới
                # Điều này đảm bảo khi drag & drop (edge ID thay đổi), edge cũ bị xóa
                targets_to_update = {
                    edge.get("target") for edge in edges_data if edge.get("target")
                }

                # Xóa edges cũ có target trùng
                edges[:] = [
                    e for e in edges if e.get("target") not in targets_to_update
                ]

                # Thêm tất cả edges mới
                for edge_data in edges_data:
                    if edge_data.get("id") and edge_data.get("source") != edge_data.get(
                        "target"
                    ):
                        edges.append(edge_data)

            mindmap_data = {"nodes": nodes, "edges": edges, "layout": layout}
            mindmap_doc.mindmap_data = json.dumps(mindmap_data, ensure_ascii=False)
            mindmap_doc.save(ignore_permissions=True)
            frappe.db.commit()

            message = {
                "entity_name": entity_name,
                "mindmap_id": mindmap_doc.name,
                "node_ids": saved_node_ids,
                "nodes": nodes_data,
                "edges": edges_data,
                "modified": str(mindmap_doc.modified),
                "modified_by": frappe.session.user,
            }

            try:
                frappe.publish_realtime(
                    event="drive_mindmap:nodes_updated_batch",
                    message=message,
                    after_commit=True,
                )
            except Exception as e:
                frappe.log_error(
                    f"Error emitting realtime event: {str(e)}",
                    "Emit Nodes Batch Update Event",
                )

            return {
                "success": True,
                "message": _("Nodes saved successfully"),
                "nodes": nodes_data,
            }

        except frappe.exceptions.TimestampMismatchError:
            retry_count += 1
            if retry_count >= max_retries:
                frappe.throw(
                    _("Không thể lưu nodes sau nhiều lần thử. Vui lòng thử lại.")
                )
            frappe.db.rollback()
            import time

            time.sleep(0.05 * retry_count)
            continue

        except Exception as e:
            frappe.log_error(f"Save nodes batch: {str(e)[:100]}", "Save Nodes Batch")
            frappe.throw(str(e))


@frappe.whitelist()
def delete_mindmap_nodes(entity_name, node_ids):
    """
    Xóa nhiều nodes trong mindmap (dùng khi xóa node và subtree của nó)

    :param entity_name: Drive File entity name
    :param node_ids: List IDs của các nodes cần xóa (JSON string hoặc list)
    """
    max_retries = 3
    retry_count = 0

    while retry_count < max_retries:
        try:
            doc_drive = frappe.get_doc("Drive File", entity_name)

            if not doc_drive or not doc_drive.mindmap:
                frappe.throw(_("Mindmap not found"), frappe.DoesNotExistError)

            if not frappe.has_permission("Drive File", "write", doc_drive):
                frappe.throw(_("No permission to edit"), frappe.PermissionError)

            mindmap_doc = frappe.get_doc("Drive Mindmap", doc_drive.mindmap)

            mindmap_doc.reload()

            if isinstance(node_ids, str):
                node_ids = json.loads(node_ids)

            current_data = {}
            if mindmap_doc.mindmap_data:
                current_data = (
                    json.loads(mindmap_doc.mindmap_data)
                    if isinstance(mindmap_doc.mindmap_data, str)
                    else mindmap_doc.mindmap_data
                )

            nodes = current_data.get("nodes", [])
            edges = current_data.get("edges", [])
            layout = current_data.get("layout", "horizontal")

            # Xóa các nodes
            nodes = [node for node in nodes if node.get("id") not in node_ids]

            # Xóa tất cả edges liên quan đến các nodes này
            edges = [
                edge
                for edge in edges
                if edge.get("source") not in node_ids
                and edge.get("target") not in node_ids
            ]

            mindmap_data = {"nodes": nodes, "edges": edges, "layout": layout}
            mindmap_doc.mindmap_data = json.dumps(mindmap_data, ensure_ascii=False)
            mindmap_doc.save(ignore_permissions=True)
            frappe.db.commit()

            message = {
                "entity_name": entity_name,
                "mindmap_id": mindmap_doc.name,
                "node_ids": node_ids,
                "modified": str(mindmap_doc.modified),
                "modified_by": frappe.session.user,
            }

            try:
                frappe.publish_realtime(
                    event="drive_mindmap:nodes_deleted",
                    message=message,
                    after_commit=True,
                )
            except Exception as e:
                frappe.log_error(
                    f"Error emitting realtime event: {str(e)}",
                    "Emit Nodes Delete Event",
                )

            return {
                "success": True,
                "message": _("Nodes deleted successfully"),
            }

        except frappe.exceptions.TimestampMismatchError:
            retry_count += 1
            if retry_count >= max_retries:
                frappe.throw(
                    _("Không thể xóa nodes sau nhiều lần thử. Vui lòng thử lại.")
                )
            frappe.db.rollback()
            continue

        except Exception as e:
            frappe.log_error(f"Delete nodes: {str(e)[:100]}", "Delete Nodes")
            frappe.throw(str(e))


@frappe.whitelist()
def get_mindmap_tree_with_positions(parent_mindmap=None, layout="vertical"):
    """
    Lấy tree structure với positions tự động tính toán

    :param parent_mindmap: Parent mindmap name
    :param layout: "vertical" hoặc "horizontal"
    :return: {nodes: [], edges: []} for VueFlow
    """
    try:
        # Get all mindmap nodes
        if parent_mindmap:
            nodes_data = frappe.db.get_all(
                "Drive Mindmap",
                filters={"parent_mindmap": parent_mindmap},
                fields=[
                    "name",
                    "title",
                    "is_group",
                    "parent_mindmap",
                    "color",
                    "owner",
                ],
                order_by="title",
            )
        else:
            nodes_data = frappe.db.get_all(
                "Drive Mindmap",
                filters=[["parent_mindmap", "in", ["", None]]],
                fields=[
                    "name",
                    "title",
                    "is_group",
                    "parent_mindmap",
                    "color",
                    "owner",
                ],
                order_by="title",
            )

        # Simple layout - vertical
        nodes = []
        edges = []
        x_spacing = 250
        y_spacing = 150

        for idx, node_data in enumerate(nodes_data):
            # Create node
            node = {
                "id": node_data["name"],
                "type": "default",
                "data": {
                    "label": node_data["title"],
                    "is_group": node_data["is_group"],
                    "color": node_data.get("color"),
                },
                "position": {"x": idx * x_spacing, "y": 0},
                "style": {
                    "padding": "10px",
                    "borderRadius": "8px",
                    "border": "2px solid",
                    "backgroundColor": node_data.get("color") or "#ffffff",
                    "borderColor": "#0149C1",
                },
            }
            nodes.append(node)

            # Create edge if has parent
            if node_data.get("parent_mindmap"):
                edge = {
                    "id": f"edge-{node_data['parent_mindmap']}-{node_data['name']}",
                    "source": node_data["parent_mindmap"],
                    "target": node_data["name"],
                    "type": "smoothstep",
                    "animated": False,
                }
                edges.append(edge)

        return {"nodes": nodes, "edges": edges, "layout": layout}

    except Exception as e:
        frappe.log_error(f"Get tree positions error: {str(e)}")
        return {"nodes": [], "edges": [], "layout": layout}


@frappe.whitelist()
def get_mindmap_tree_structure(parent_mindmap=None):
    """
    Lấy tree structure (hierarchical format)
    Kept for backward compatibility
    """
    try:
        if parent_mindmap:
            children = frappe.db.get_all(
                "Drive Mindmap",
                filters={"parent_mindmap": parent_mindmap},
                fields=[
                    "name",
                    "title",
                    "is_group",
                    "parent_mindmap",
                    "color",
                    "owner",
                ],
                order_by="title",
            )
        else:
            children = frappe.db.get_all(
                "Drive Mindmap",
                filters=[["parent_mindmap", "in", ["", None]]],
                fields=[
                    "name",
                    "title",
                    "is_group",
                    "parent_mindmap",
                    "color",
                    "owner",
                ],
                order_by="title",
            )

        # Build tree recursively
        tree = []
        for child in children:
            node = {
                "name": child["name"],
                "title": child["title"],
                "is_group": child["is_group"],
                "parent": child.get("parent_mindmap"),
                "color": child.get("color"),
                "owner": child["owner"],
                "children": [],
            }

            # Get children recursively
            if child["is_group"]:
                node["children"] = get_mindmap_tree_structure(child["name"])

            tree.append(node)

        return tree

    except Exception as e:
        frappe.log_error(f"Get tree structure error: {str(e)}")
        return []


@frappe.whitelist()
def create_mindmap_entity(title, personal, team, content=None, parent=None):
    """
    Create a new MindMap entity
    Drive Mindmap kế thừa permissions từ Drive File

    :param title: Tên mindmap (sẽ dùng làm root node label)
    :param personal: Private (1) hoặc Team (0)
    :param team: Team name
    :param content: Description (optional)
    :param parent: Parent folder
    :return: Drive File dict
    """
    from drive.api.files import (
        get_home_folder,
        copy_permissions_to_entity,
        create_new_entity_activity_log,
    )

    origin_parent = parent
    home_directory = get_home_folder(team)
    parent = parent or home_directory.name

    # Check permission on parent folder
    if not frappe.has_permission(
        doctype="Drive File",
        doc=parent,
        ptype="write",
        user=frappe.session.user,
    ):
        frappe.throw("Cannot access folder", frappe.PermissionError)

    # Step 1: Create Drive Mindmap document (backend data structure)
    drive_mindmap = frappe.new_doc("Drive Mindmap")
    drive_mindmap.title = title
    drive_mindmap.is_group = 0  # Not a folder
    drive_mindmap.parent_mindmap = None  # Root level

    # Tạo root node với title và description (nếu có)
    # Format label: HTML với paragraph cho title và blockquote cho description
    # Escape HTML trong title để tránh XSS
    escaped_title = html.escape(title)
    root_label = f"<p>{escaped_title}</p>"
    if content and content.strip():
        # Escape HTML trong description để tránh XSS
        escaped_content = html.escape(content.strip())
        root_label += f"<blockquote><p>{escaped_content}</p></blockquote>"

    root_node = {"id": "root", "data": {"label": root_label, "isRoot": True}}

    # Initialize mindmap_data với root node
    mindmap_data = {"nodes": [root_node], "edges": [], "layout": "custom"}
    drive_mindmap.mindmap_data = json.dumps(mindmap_data, ensure_ascii=False)

    drive_mindmap.insert()
    frappe.db.commit()

    print(f"✅ Created Drive Mindmap: {drive_mindmap.name}")

    # Step 2: Create Drive File entity (permissions container)
    # Title giờ là Text, không cần cắt nữa - dùng trực tiếp title
    drive_file = frappe.new_doc("Drive File")
    drive_file.team = team
    drive_file.is_private = int(personal)
    drive_file.title = title
    drive_file.parent_entity = parent
    drive_file.file_size = 0
    drive_file.mime_type = "mindmap"
    drive_file.mindmap = drive_mindmap.name
    drive_file.is_group = 0

    drive_file.insert()
    frappe.db.commit()

    print(f"✅ Created Drive File: {drive_file.name} → mindmap: {drive_file.mindmap}")

    # Step 3: Copy permissions từ parent folder
    # Drive Mindmap sẽ check permissions qua Drive File
    if origin_parent:
        get_permissions = frappe.get_all(
            "Drive Permission",
            {"entity": origin_parent},
            ["user", "read", "share", "write", "comment", "valid_until"],
        )
        copy_permissions_to_entity(drive_file.name, get_permissions)
        print(f"✅ Copied {len(get_permissions)} permissions to Drive File")

    # Step 4: Create activity log
    try:
        create_new_entity_activity_log(entity=drive_file.name, action_type="create")
    except:
        pass

    return drive_file.as_dict()


@frappe.whitelist()
def import_mindmap_nextgrp(entity_name, nextgrp_data):
    """
    Import mindmap từ NextGRP format

    :param entity_name: Drive File entity name
    :param nextgrp_data: NextGRP format data (dict hoặc JSON string)
    :return: Dict với nodes_count và edges_count
    """
    try:
        # Get Drive File
        doc_drive = frappe.get_doc("Drive File", entity_name)

        if not doc_drive or not doc_drive.mindmap:
            frappe.throw(_("Mindmap not found"), frappe.DoesNotExistError)

        # Check permission
        if not frappe.has_permission("Drive File", "write", doc_drive):
            frappe.throw(_("No permission to edit"), frappe.PermissionError)

        # Parse nextgrp_data if string
        if isinstance(nextgrp_data, str):
            nextgrp_data = json.loads(nextgrp_data)

        # Validate NextGRP format
        if not isinstance(nextgrp_data, dict):
            frappe.throw(_("Invalid NextGRP data format"), ValueError)

        if nextgrp_data.get("format") != "nextgrp":
            frappe.throw(_("File is not in NextGRP format"), ValueError)

        if not nextgrp_data.get("mindmap"):
            frappe.throw(_("NextGRP data missing mindmap section"), ValueError)

        mindmap_section = nextgrp_data.get("mindmap", {})

        if not mindmap_section.get("nodes"):
            frappe.throw(_("NextGRP data missing nodes"), ValueError)

        # Extract nodes and edges
        imported_nodes = mindmap_section.get("nodes", [])
        imported_edges = mindmap_section.get("edges", [])
        layout = mindmap_section.get("layout", "horizontal")

        # Get Drive Mindmap
        mindmap_doc = frappe.get_doc("Drive Mindmap", doc_drive.mindmap)

        # Prepare mindmap_data format
        mindmap_data = {
            "nodes": imported_nodes,
            "edges": imported_edges,
            "layout": layout,
        }

        # Save mindmap_data
        mindmap_doc.mindmap_data = json.dumps(mindmap_data, ensure_ascii=False)
        mindmap_doc.save(ignore_permissions=True)
        frappe.db.commit()

        return {
            "nodes_count": len(imported_nodes),
            "edges_count": len(imported_edges),
            "message": _("Mindmap imported successfully"),
        }

    except Exception as e:
        frappe.log_error(
            f"Import mindmap error: {frappe.get_traceback()}", "Import Mindmap NextGRP"
        )
        frappe.throw(str(e))


@frappe.whitelist()
def save_mindmap_collapsed_nodes(entity_name, collapsed_node_ids):
    """
    Lưu trạng thái collapsed nodes vào database và emit realtime event

    :param entity_name: Drive File entity name
    :param collapsed_node_ids: List các node IDs đang collapsed
    """
    try:
        # Get Drive File
        doc_drive = frappe.get_doc("Drive File", entity_name)

        if not doc_drive or not doc_drive.mindmap:
            frappe.throw(_("Mindmap not found"), frappe.DoesNotExistError)

        # Check permission (chỉ cần read để xem collapse state)
        if not frappe.has_permission("Drive File", "read", doc_drive):
            frappe.throw(_("No permission to access"), frappe.PermissionError)

        # Get Drive Mindmap
        mindmap_doc = frappe.get_doc("Drive Mindmap", doc_drive.mindmap)

        # Parse collapsed_node_ids nếu là string
        if isinstance(collapsed_node_ids, str):
            collapsed_node_ids = json.loads(collapsed_node_ids)

        # Load viewport_state hiện tại
        viewport_data = {}
        if mindmap_doc.viewport_state:
            try:
                viewport_data = (
                    json.loads(mindmap_doc.viewport_state)
                    if isinstance(mindmap_doc.viewport_state, str)
                    else mindmap_doc.viewport_state
                )
            except:
                viewport_data = {}

        # Update collapsed_nodes
        viewport_data["collapsed_nodes"] = (
            collapsed_node_ids if isinstance(collapsed_node_ids, list) else []
        )

        # Save viewport_state
        mindmap_doc.viewport_state = json.dumps(viewport_data, ensure_ascii=False)
        mindmap_doc.save(ignore_permissions=True)
        frappe.db.commit()

        # Emit realtime event để sync cho các users khác
        message = {
            "entity_name": entity_name,
            "mindmap_id": mindmap_doc.name,
            "collapsed_node_ids": collapsed_node_ids,
            "modified_by": frappe.session.user,
            "timestamp": frappe.utils.now(),
        }

        try:
            frappe.publish_realtime(
                event="drive_mindmap:collapsed_nodes_updated",
                message=message,
                after_commit=True,
            )
            print(
                f"📡 Emitted collapsed_nodes_updated event for {entity_name}: {len(collapsed_node_ids)} collapsed nodes"
            )
        except Exception as e:
            frappe.log_error(
                f"Error emitting collapsed_nodes_updated event: {str(e)}",
                "Emit Collapsed Nodes Event",
            )

        return {
            "success": True,
            "message": _("Collapsed nodes saved successfully"),
            "collapsed_node_ids": collapsed_node_ids,
        }

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Save Collapsed Nodes Error")
        frappe.throw(str(e))
