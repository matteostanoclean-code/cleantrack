"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";

type Task = {
  id: string;
  title: string;
  status: string | null;
  priority: string | null;
  due_date: string | null;
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    const { data } = await supabase.from("tasks").select("*");

    setTasks(data || []);
    setLoading(false);
  }

  function getStatus(task: Task) {
    return task?.status || "open";
  }

  function groupedTasks(status: string) {
    return tasks.filter((t) => getStatus(t) === status);
  }

  function createTask() {
    const title = prompt("Titel der Aufgabe?");
    if (!title) return;

    supabase.from("tasks").insert([
      {
        title,
        status: "new",
      },
    ]);

    loadTasks();
  }

  if (loading) {
    return <p className="p-6">Lade Aufgaben...</p>;
  }

  return (
    <main className="p-6 bg-[#f4f7fb] min-h-screen">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Aufgaben</h1>

        <div className="flex gap-2">
          <button
            onClick={() => setView("kanban")}
            className={`px-4 py-2 rounded-xl ${view === "kanban" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
          >
            Kanban
          </button>

          <button
            onClick={() => setView("table")}
            className={`px-4 py-2 rounded-xl ${view === "table" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
          >
            Liste
          </button>

          <button
            onClick={createTask}
            className="px-4 py-2 bg-blue-500 text-white rounded-xl"
          >
            + Aufgabe erstellen
          </button>
        </div>
      </div>

      {/* TABLE */}
      {view === "table" && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="py-2">Titel</th>
                <th>Status</th>
                <th>Priorität</th>
                <th>Fällig</th>
              </tr>
            </thead>

            <tbody>
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-gray-400">
                    Keine Aufgaben vorhanden
                  </td>
                </tr>
              )}

              {tasks?.map((task) => (
                <tr key={task.id} className="border-t">
                  <td className="py-2 font-medium">
                    {task?.title || "-"}
                  </td>

                  <td>{getStatus(task)}</td>

                  <td>{task?.priority || "-"}</td>

                  <td>{task?.due_date || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* KANBAN */}
      {view === "kanban" && (
        <div className="grid grid-cols-4 gap-4">

          {[
            { key: "new", label: "Neu" },
            { key: "open", label: "Offen" },
            { key: "in_progress", label: "In Arbeit" },
            { key: "review", label: "Prüfung" },
          ].map((col) => (
            <div key={col.key} className="bg-white rounded-2xl p-3 shadow-sm">

              <p className="font-bold mb-3">{col.label}</p>

              <div className="space-y-2">
                {groupedTasks(col.key).length === 0 && (
                  <p className="text-gray-400 text-sm">Keine Aufgaben</p>
                )}

                {groupedTasks(col.key).map((task) => (
                  <div
                    key={task.id}
                    className="p-3 bg-gray-100 rounded-xl"
                  >
                    <p className="font-bold text-sm">
                      {task?.title || "-"}
                    </p>

                    <p className="text-xs text-gray-400">
                      {task?.priority || "keine Priorität"}
                    </p>
                  </div>
                ))}
              </div>

            </div>
          ))}

        </div>
      )}

    </main>
  );
}