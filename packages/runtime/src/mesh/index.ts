export { buildTopology, edgeKey, type Cage, type Topology } from "./topology";
export { subdivideCatmullClark } from "./catmullClark";
export { triangulate, type Triangulated } from "./triangulate";
export { extrudeFaces, deleteFaces } from "./ops";
export {
  boxCage,
  planeCage,
  cylinderCage,
  sphereCage,
  torusCage,
  cageFromGeometry,
} from "./primitives";
