import { Route, Routes } from "react-router-dom";
import { createLetterApi } from "./api/letters";
import { ComposePage } from "./compose/ComposePage";
import { LetterPage } from "./letter/LetterPage";

const api = createLetterApi();

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ComposePage api={api} />} />
      <Route path="/letter/:id" element={<LetterPage api={api} />} />
    </Routes>
  );
}
