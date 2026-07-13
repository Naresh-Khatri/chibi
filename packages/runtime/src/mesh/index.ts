export { buildTopology, edgeKey, type Cage, type Topology } from "./topology";
export { subdivideCatmullClark } from "./catmullClark";
export { splitVerticesAtSharpEdges } from "./splitSharp";
export { triangulate, type Triangulated } from "./triangulate";
export {
  extrudeFaces,
  deleteFaces,
  computeEdgeLoop,
  applyLoopCut,
  type EdgeLoop,
} from "./ops";
export {
  boxCage,
  planeCage,
  cylinderCage,
  sphereCage,
  torusCage,
  cageFromGeometry,
} from "./primitives";
