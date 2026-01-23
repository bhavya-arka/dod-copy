import { Router } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import {
  dagNodeService,
  dagEdgeService,
  cargoService,
  cargoAssignmentService
} from "../services";

const router = Router();

// ============================================================================
// DAG NODES API (PROTECTED)
// ============================================================================

router.post("/dag/nodes", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const node = await dagNodeService.createNode({
      ...req.body,
      user_id: req.user!.id
    });
    res.status(201).json(node);
  } catch (error) {
    console.error('Failed to create DAG node:', error);
    res.status(500).json({ error: "Failed to create node" });
  }
});

router.get("/dag/nodes", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const nodes = await dagNodeService.getNodes(req.user!.id);
    res.json(nodes);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch nodes" });
  }
});

router.get("/dag/nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const node = await dagNodeService.getNode(req.params.id, req.user!.id);
    if (!node) {
      return res.status(404).json({ error: "Node not found" });
    }
    res.json(node);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch node" });
  }
});

router.get("/dag/nodes/:id/children", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const children = await dagNodeService.getChildren(req.params.id, req.user!.id);
    res.json(children);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch children" });
  }
});

router.get("/dag/nodes/:id/parents", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const parents = await dagNodeService.getParents(req.params.id, req.user!.id);
    res.json(parents);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch parents" });
  }
});

router.get("/dag/nodes/:id/ancestors", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const ancestors = await dagNodeService.getAncestors(req.params.id, req.user!.id);
    res.json(ancestors);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch ancestors" });
  }
});

router.get("/dag/nodes/:id/descendants", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const descendants = await dagNodeService.getDescendants(req.params.id, req.user!.id);
    res.json(descendants);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch descendants" });
  }
});

router.patch("/dag/nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { user_id, id, ...safeData } = req.body;
    const node = await dagNodeService.updateNode(req.params.id, req.user!.id, safeData);
    if (!node) {
      return res.status(404).json({ error: "Node not found" });
    }
    res.json(node);
  } catch (error) {
    res.status(500).json({ error: "Failed to update node" });
  }
});

router.delete("/dag/nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    await dagNodeService.deleteNode(req.params.id, req.user!.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete node" });
  }
});

router.get("/dag/nodes/:id/cargo", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const cargo = await cargoAssignmentService.getCargoAtNode(req.params.id, req.user!.id);
    res.json(cargo);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch cargo at node" });
  }
});

// ============================================================================
// DAG EDGES API (PROTECTED)
// ============================================================================

router.post("/dag/edges", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await dagEdgeService.createEdge({
      ...req.body,
      user_id: req.user!.id
    });
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.status(201).json(result.edge);
  } catch (error) {
    console.error('Failed to create DAG edge:', error);
    res.status(500).json({ error: "Failed to create edge" });
  }
});

router.get("/dag/edges", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const edges = await dagEdgeService.getEdges(req.user!.id);
    res.json(edges);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch edges" });
  }
});

router.get("/dag/edges/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const edge = await dagEdgeService.getEdge(req.params.id, req.user!.id);
    if (!edge) {
      return res.status(404).json({ error: "Edge not found" });
    }
    res.json(edge);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch edge" });
  }
});

router.post("/dag/edges/validate", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { parent_id, child_id, cargo_shared } = req.body;
    if (!parent_id || !child_id) {
      return res.status(400).json({ error: "parent_id and child_id are required" });
    }
    const result = await dagEdgeService.validateEdge(
      parent_id,
      child_id,
      req.user!.id,
      cargo_shared ?? false
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to validate edge" });
  }
});

router.patch("/dag/edges/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { user_id, id, parent_id, child_id, ...safeData } = req.body;
    const edge = await dagEdgeService.updateEdge(req.params.id, req.user!.id, safeData);
    if (!edge) {
      return res.status(404).json({ error: "Edge not found" });
    }
    res.json(edge);
  } catch (error) {
    res.status(500).json({ error: "Failed to update edge" });
  }
});

router.delete("/dag/edges/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    await dagEdgeService.deleteEdge(req.params.id, req.user!.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete edge" });
  }
});

// ============================================================================
// DAG CARGO API (PROTECTED)
// ============================================================================

router.post("/dag/cargo", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const cargo = await cargoService.createCargoItem({
      ...req.body,
      user_id: req.user!.id
    });
    res.status(201).json(cargo);
  } catch (error) {
    console.error('Failed to create cargo item:', error);
    res.status(500).json({ error: "Failed to create cargo item" });
  }
});

router.get("/dag/cargo", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const cargoType = req.query.type as string | undefined;
    const hazmatOnly = req.query.hazmat === 'true';
    
    let items;
    if (hazmatOnly) {
      items = await cargoService.getHazmatCargoItems(req.user!.id);
    } else if (cargoType) {
      items = await cargoService.getCargoItemsByType(cargoType, req.user!.id);
    } else {
      items = await cargoService.getCargoItems(req.user!.id);
    }
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch cargo items" });
  }
});

router.get("/dag/cargo/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const cargo = await cargoService.getCargoItem(req.params.id, req.user!.id);
    if (!cargo) {
      return res.status(404).json({ error: "Cargo item not found" });
    }
    res.json(cargo);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch cargo item" });
  }
});

router.get("/dag/cargo/tcn/:tcn", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const cargo = await cargoService.getCargoItemByTcn(req.params.tcn, req.user!.id);
    if (!cargo) {
      return res.status(404).json({ error: "Cargo item not found" });
    }
    res.json(cargo);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch cargo item by TCN" });
  }
});

router.patch("/dag/cargo/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { user_id, id, ...safeData } = req.body;
    const cargo = await cargoService.updateCargoItem(req.params.id, req.user!.id, safeData);
    if (!cargo) {
      return res.status(404).json({ error: "Cargo item not found" });
    }
    res.json(cargo);
  } catch (error) {
    res.status(500).json({ error: "Failed to update cargo item" });
  }
});

router.delete("/dag/cargo/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    await cargoService.deleteCargoItem(req.params.id, req.user!.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete cargo item" });
  }
});

// ============================================================================
// DAG CARGO ASSIGNMENTS API (PROTECTED)
// ============================================================================

router.post("/dag/assignments", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const assignment = await cargoAssignmentService.createAssignment({
      ...req.body,
      user_id: req.user!.id
    });
    res.status(201).json(assignment);
  } catch (error) {
    console.error('Failed to create assignment:', error);
    res.status(500).json({ error: "Failed to create assignment" });
  }
});

router.post("/dag/cargo/:cargoId/assign/:nodeId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { status, sequence, pallet_position, metadata } = req.body;
    const assignment = await cargoAssignmentService.assignCargoToNode(
      req.params.cargoId,
      req.params.nodeId,
      req.user!.id,
      { status, sequence, palletPosition: pallet_position, metadata }
    );
    res.status(201).json(assignment);
  } catch (error) {
    console.error('Failed to assign cargo to node:', error);
    res.status(500).json({ error: "Failed to assign cargo to node" });
  }
});

router.get("/dag/assignments", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const status = req.query.status as string | undefined;
    let assignments;
    if (status) {
      assignments = await cargoAssignmentService.getAssignmentsByStatus(status, req.user!.id);
    } else {
      assignments = await cargoAssignmentService.getAssignments(req.user!.id);
    }
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch assignments" });
  }
});

router.get("/dag/assignments/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const assignment = await cargoAssignmentService.getAssignment(req.params.id, req.user!.id);
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }
    res.json(assignment);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch assignment" });
  }
});

router.patch("/dag/assignments/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { user_id, id, cargo_id, node_id, ...safeData } = req.body;
    const assignment = await cargoAssignmentService.updateAssignment(
      req.params.id,
      req.user!.id,
      safeData
    );
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }
    res.json(assignment);
  } catch (error) {
    res.status(500).json({ error: "Failed to update assignment" });
  }
});

router.patch("/dag/assignments/:id/status", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['assigned', 'in_transit', 'delivered', 'pending'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status", validStatuses });
    }
    const assignment = await cargoAssignmentService.updateAssignmentStatus(
      req.params.id,
      req.user!.id,
      status
    );
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }
    res.json(assignment);
  } catch (error) {
    res.status(500).json({ error: "Failed to update assignment status" });
  }
});

router.delete("/dag/assignments/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    await cargoAssignmentService.deleteAssignment(req.params.id, req.user!.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete assignment" });
  }
});

export default router;
