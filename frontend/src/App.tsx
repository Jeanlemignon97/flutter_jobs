import { useEffect, useState, useCallback } from 'react';
import { Button } from './components/ui/Button';
import { Input } from './components/ui/Input';
import { JobCard } from './components/JobCard';
import { Briefcase, MapPin, Search, Filter, Hash, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';

interface Job {
  id: string;
  title: string;
  company: string;
  city: string;
  contract: string;
  remote: string;
  salary: string | null;
  url: string;
  source: string;
  scraped_at: string;
  posted_at?: string;
  description?: string;
  is_applied?: boolean;
}

interface Stats {
  total: number;
  newLast48h: number;
  remote: number;
  bySource: Record<string, number>;
  lastScraped: string;
}

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Tabs
  // 'new' (<3j) | 'old' (>3j && <14j) | 'applied' (Supabase)
  const [activeTab, setActiveTab] = useState<'new'|'old'|'applied'>('new');
  
  const toggleApplied = useCallback(async (job: Job) => {
    // 1. Optimistic UI update: On change l'état visuellement tout de suite
    const newAppliedStatus = !job.is_applied;
    
    setJobs(currentJobs => 
      currentJobs.map(j => {
        if (j.id === job.id) {
          return { ...j, is_applied: newAppliedStatus };
        }
        return j;
      })
    );

    // 2. Appel API réel pour persister dans Supabase
    try {
      const res = await fetch(`/api/jobs/${job.id}/apply`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_applied: newAppliedStatus })
      });
      if (!res.ok) throw new Error("Erreur lors de la mise à jour");
    } catch (error) {
      console.error(error);
      // En cas d'erreur de réseau, on remet l'état initial
      setJobs(currentJobs => 
        currentJobs.map(j => {
          if (j.id === job.id) return { ...j, is_applied: !newAppliedStatus };
          return j;
        })
      );
    }
  }, []);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [city, setCity] = useState('');
  const [contract, setContract] = useState('');
  const [remote, setRemote] = useState('');
  const [sortDir, setSortDir] = useState('desc');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  // Fetch stats once
  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error("Could not fetch stats", err));
  }, []);

  // Fetch jobs when filters change
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '15',
        age: activeTab,
      });
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (city) params.set('city', city);
      if (contract) params.set('contract', contract);
      if (remote) params.set('remote', remote);
      params.set('sortDir', sortDir);

      const res = await fetch(`/api/jobs?${params.toString()}`);
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setJobs(data.jobs || []);
      setTotalPages(data.totalPages || 1);
      setTotalResults(data.total || 0);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, city, contract, remote, page, sortDir, activeTab]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const resetFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setCity('');
    setContract('');
    setRemote('');
    setSortDir('desc');
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-6 px-6 shadow-sm border-b border-primary/20">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Briefcase className="w-6 h-6 opacity-90" />
              Flutter Jobs <span className="opacity-70 font-normal ml-1 text-lg">Suisse romande</span>
            </h1>
            <p className="text-sm opacity-80 mt-1">
              Dernière mise à jour : {stats ? new Date(stats.lastScraped).toLocaleString('fr-FR') : '...'}
            </p>
          </div>
          <a
            href="https://github.com/Jeanlemignon97/flutter_jobs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm rounded-full bg-white/10 hover:bg-white/20 transition px-4 py-2"
          >
            Open Source
          </a>
        </div>
      </header>

      {/* Hero Stats */}
      <div className="bg-card border-b shadow-sm mb-8 z-10 sticky top-0">
        <div className="max-w-6xl mx-auto px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">{stats?.total || '—'}</div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1 font-semibold">Offres actives</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">{stats?.newLast48h || '—'}</div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1 font-semibold">Nouvelles (48h)</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">{stats?.remote || '—'}</div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1 font-semibold">Remote & Hybride</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">{stats ? Object.keys(stats.bySource).length : '—'}</div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1 font-semibold">Sources actives</div>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Sidebar Filters */}
        <aside className="lg:col-span-1 space-y-6">
          <div className="bg-card border shadow-sm rounded-xl p-5 sticky top-32">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <Filter className="w-4 h-4" /> Filtres
            </h2>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">Lieu</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <select 
                    className="w-full h-10 pl-9 pr-4 rounded-md border bg-background text-sm shadow-sm hover:border-primary/50 transition-colors focus:ring-1 focus:ring-primary outline-none"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                  >
                    <option value="">Toute la Suisse</option>
                    <option value="Genève">Genève</option>
                    <option value="Lausanne">Lausanne</option>
                    <option value="Zurich">Zurich</option>
                    <option value="Bâle">Bâle / Basel</option>
                    <option value="Bern">Berne / Bern</option>
                    <option value="Neuchâtel">Neuchâtel</option>
                    <option value="Remote">Remote</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Type de contrat</label>
                <select 
                  className="w-full h-10 px-3 rounded-md border bg-background text-sm shadow-sm hover:border-primary/50 transition-colors focus:ring-1 focus:ring-primary outline-none"
                  value={contract}
                  onChange={e => setContract(e.target.value)}
                >
                  <option value="">Tous les contrats</option>
                  <option value="CDI">CDI</option>
                  <option value="CDD">CDD</option>
                  <option value="Freelance">Freelance</option>
                  <option value="Stage">Stage</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Télétravail</label>
                <select 
                  className="w-full h-10 px-3 rounded-md border bg-background text-sm shadow-sm hover:border-primary/50 transition-colors focus:ring-1 focus:ring-primary outline-none"
                  value={remote}
                  onChange={e => setRemote(e.target.value)}
                >
                  <option value="">Toutes les options</option>
                  <option value="Full Remote">Full Remote</option>
                  <option value="Hybride">Hybride</option>
                  <option value="Sur site">Sur site</option>
                </select>
              </div>

              <Button 
                variant="secondary"
                onClick={resetFilters}
                className="w-full mt-6"
              >
                Réinitialiser les filtres
              </Button>
            </div>
          </div>
        </aside>

        {/* Content */}
        <section className="lg:col-span-3 space-y-6">
          {/* Onglets de navigation */}
          <div className="flex bg-card border rounded-xl shadow-sm p-1 gap-1 overflow-x-auto no-scrollbar">
            <button
              onClick={() => { setActiveTab('new'); setPage(1); }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'new' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:bg-secondary/50'}`}
            >
              🔥 Nouvelles <span className="hidden sm:inline">( {`< 3j`} )</span>
            </button>
            <button
              onClick={() => { setActiveTab('old'); setPage(1); }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'old' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:bg-secondary/50'}`}
            >
              📆 Anciennes <span className="hidden sm:inline">( {`< 14j`} )</span>
            </button>
            <button
              onClick={() => { setActiveTab('applied'); setPage(1); }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'applied' ? 'bg-[#085041] text-white shadow' : 'text-muted-foreground hover:bg-secondary/50'}`}
            >
              <CheckCircle2 className="w-4 h-4" /> Candidatées
            </button>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Rechercher un poste, une techno, une entreprise..."
                className="pl-9 rounded-full bg-card shadow-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <select
                className="h-10 px-3 rounded-full border bg-card text-sm font-medium shadow-sm hover:border-primary/50 transition-colors focus:ring-1 focus:ring-primary outline-none text-muted-foreground"
                value={sortDir}
                onChange={e => {
                  setSortDir(e.target.value);
                  setPage(1);
                }}
              >
                <option value="desc">Plus récentes d'abord</option>
                <option value="asc">Ordre croissant (anciennes en premier)</option>
              </select>
              <div className="text-sm text-muted-foreground font-medium whitespace-nowrap bg-card px-4 py-2 rounded-full border shadow-sm">
                <span className="text-foreground font-bold">{totalResults}</span> offres trouvées
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-4 text-muted-foreground">
                <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                <p>Chargement des opportunités...</p>
              </div>
            ) : jobs.length === 0 ? (
              <div className="py-20 text-center bg-card rounded-xl border border-dashed shadow-sm">
                <Hash className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                <h3 className="text-lg font-medium text-foreground">Aucune offre trouvée</h3>
                <p className="text-muted-foreground text-sm mt-1">Essaie d'ajuster tes filtres de recherche.</p>
                <Button variant="outline" onClick={resetFilters} className="mt-4">Effacer les filtres</Button>
              </div>
            ) : (
              jobs.map(job => (
                <JobCard 
                  key={job.id || job.url} 
                  job={job} 
                  isApplied={!!job.is_applied}
                  onToggleApplied={() => toggleApplied(job)}
                />
              ))
            )}
          </div>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8 pt-4">
              <Button 
                variant="outline"
                disabled={page === 1} 
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Précédent
              </Button>
              <div className="flex items-center gap-1">
                {[...Array(totalPages)].map((_, i) => {
                  const p = i + 1;
                  if (p === 1 || p === totalPages || (Math.abs(page - p) <= 1)) {
                    return (
                      <Button 
                        key={p} 
                        variant={page === p ? 'default' : 'outline'}
                        size="icon"
                        onClick={() => setPage(p)}
                        className="w-9 h-9"
                      >
                        {p}
                      </Button>
                    )
                  } else if (Math.abs(page - p) === 2) {
                    return <span key={p} className="text-muted-foreground mx-0.5">...</span>
                  }
                  return null;
                })}
              </div>
              <Button 
                variant="outline"
                disabled={page === totalPages} 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Suivant
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
