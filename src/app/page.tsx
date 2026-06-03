"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Gatekeeper() {
  const router = useRouter();
  const [contributor, setContributor] = useState("");
  const [email, setEmail] = useState("");
  const [isHovering, setIsHovering] = useState(false);
  
  // Consent states
  const [is18Plus, setIs18Plus] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (contributor.trim() && email.trim() && is18Plus && hasConsented) {
      localStorage.setItem("glove_contributor", contributor.trim());
      localStorage.setItem("glove_email", email.trim());
      router.push("/record");
    }
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-6">
      <div 
        className="glass-panel w-full max-w-md p-8 relative overflow-hidden transition-all duration-500"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div 
          className={`absolute -top-24 -right-24 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl transition-opacity duration-700 ${isHovering ? 'opacity-100' : 'opacity-30'}`} 
        />
        <div 
          className={`absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl transition-opacity duration-700 ${isHovering ? 'opacity-100' : 'opacity-30'}`} 
        />

        <div className="relative z-10 flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">G.L.O.V.E.</h1>
          <p className="text-zinc-400 text-sm">Research Data Collection Portal</p>
        </div>

        <form onSubmit={handleLogin} className="relative z-10 flex flex-col gap-5">
          <div className="flex flex-col gap-2 text-left">
            <label htmlFor="contributor" className="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1">
              Full Name
            </label>
            <input
              id="contributor"
              type="text"
              value={contributor}
              onChange={(e) => setContributor(e.target.value)}
              placeholder="e.g. Jane Doe"
              className="glass-input"
              required
            />
          </div>

          <div className="flex flex-col gap-2 text-left">
            <label htmlFor="email" className="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="For data removal requests"
              className="glass-input"
              required
            />
          </div>

          <div className="flex flex-col gap-3 mt-2 p-4 bg-black/20 rounded-xl border border-white/5">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={is18Plus}
                onChange={(e) => setIs18Plus(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900 cursor-pointer"
                required
              />
              <span className="text-xs text-zinc-300 group-hover:text-white transition-colors leading-relaxed">
                I confirm that I am 18 years of age or older.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={hasConsented}
                onChange={(e) => setHasConsented(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900 cursor-pointer"
                required
              />
              <span className="text-xs text-zinc-300 group-hover:text-white transition-colors leading-relaxed">
                I consent to my biometric data (video and extracted ASL gesture landmarks) being securely collected and stored for academic research purposes.
              </span>
            </label>
          </div>
          
          <button 
            type="submit" 
            disabled={!is18Plus || !hasConsented || !email || !contributor}
            className="btn-primary mt-2 flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>Enter Research Bay</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </form>

        <div className="relative z-10 mt-6 text-center">
          <p className="text-[10px] text-zinc-500 leading-relaxed">
            <strong>Data Privacy & Removal Policy:</strong> Your email is securely linked to your recordings. If you wish to revoke consent and permanently delete your data from the Hugging Face repository at any time, please contact the lead researcher using the email you provided above.
          </p>
        </div>
      </div>
      
      <p className="mt-8 text-xs text-zinc-600 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
        System Online • Secure Connection
      </p>
    </main>
  );
}
