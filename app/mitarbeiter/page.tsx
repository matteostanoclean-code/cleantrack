'use client'
import { useRouter } from 'next/navigation'
export default function Page(){
 const r=useRouter()
 return <main className="p-5">
 <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
 <div className="grid grid-cols-2 gap-4">
 <button onClick={()=>r.push('/mitarbeiter/tasks')}>Aufgaben</button>
 <button onClick={()=>r.push('/mitarbeiter/clock')}>Stempeluhr</button>
 <button onClick={()=>r.push('/mitarbeiter/schedule')}>Planung</button>
 <button onClick={()=>r.push('/mitarbeiter/profile')}>Profil</button>
 </div>
 </main>
}