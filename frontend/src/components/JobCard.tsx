import { Badge } from './ui/Badge';
import { MapPin, Building, Calendar, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

export function JobCard({ job }: { job: any }) {
  const now = Date.now();
  const scrapedAt = new Date(job.scraped_at).getTime();
  const isNew = (now - scrapedAt) < 48 * 3600 * 1000;
  
  const daysDiff = Math.floor((now - scrapedAt) / 86400000);
  const dateStr = daysDiff === 0 ? "Aujourd'hui" : daysDiff === 1 ? "Hier" : `Il y a ${daysDiff}j`;

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'jobup': return 'border-[#1D9E75] text-[#1D9E75] bg-[#1D9E75]/5';
      case 'jobs_ch': return 'border-[#185FA5] text-[#185FA5] bg-[#185FA5]/5';
      case 'swissdev': return 'border-[#534AB7] text-[#534AB7] bg-[#534AB7]/5';
      case 'indeed': return 'border-[#3B6D11] text-[#3B6D11] bg-[#3B6D11]/5';
      case 'emploi_it': return 'border-[#BA7517] text-[#BA7517] bg-[#BA7517]/5';
      default: return 'border-muted-foreground text-muted-foreground bg-muted/50';
    }
  };

  const formatSource = (src: string) => {
    return src === 'jobs_ch' ? 'Jobs.ch' :
           src === 'emploi_it' ? 'Emploi-IT' : 
           src.charAt(0).toUpperCase() + src.slice(1);
  };

  return (
    <a 
      href={job.url} 
      target="_blank" 
      rel="noopener noreferrer"
      className={cn(
        "group block bg-card rounded-xl border p-5 sm:p-6 transition-all duration-200 hover:shadow-md hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
        isNew && "border-l-4 border-l-primary"
      )}
    >
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex-1 space-y-1">
          <h3 className="text-lg font-semibold leading-tight group-hover:text-primary transition-colors">
            {job.title}
          </h3>
          
          <div className="flex items-center text-sm font-medium text-primary/80 mt-1">
            <Building className="w-4 h-4 mr-1.5 opacity-70" />
            {job.company || 'Entreprise confidentielle'}
          </div>
        </div>

        <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 flex-shrink-0">
          {job.salary && (
            <div className="flex items-center text-xs font-semibold px-2.5 py-1 bg-[#FAEEDA] text-[#633806] rounded-md">
              <Wallet className="w-3.5 h-3.5 mr-1.5 opacity-70" />
              {job.salary}
            </div>
          )}
          <div className="flex items-center text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5 mr-1" />
            {dateStr}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 text-sm text-muted-foreground">
        <span className="flex items-center"><MapPin className="w-3.5 h-3.5 mr-1" /> {job.city || 'Suisse'}</span>
        <span className="flex items-center">📋 {job.contract || 'CDI'}</span>
        <span className="flex items-center">🏠 {job.remote || 'Sur site'}</span>
      </div>

      {job.description && (
        <p className="mt-4 text-sm text-muted-foreground line-clamp-2 leading-relaxed">
          {job.description}
        </p>
      )}

      <div className="mt-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-wrap gap-2">
          {Array.isArray(job.tags) && job.tags.map((t: string) => (
            <Badge key={t} variant={(t === 'Flutter' || t === 'Dart') ? 'flutter' : 'tech'}>
              {t}
            </Badge>
          ))}
          {isNew && <Badge variant="new">Nouveau</Badge>}
        </div>
        
        <Badge 
          className={cn("ml-auto bg-transparent border shadow-none", getSourceColor(job.source))}
        >
          {formatSource(job.source)}
        </Badge>
      </div>
    </a>
  );
}
