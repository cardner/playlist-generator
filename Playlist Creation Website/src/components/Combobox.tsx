import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  icon?: React.ReactNode;
}

export function Combobox({ value, onChange, options, placeholder, icon }: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allOptions, setAllOptions] = useState(options);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = allOptions.filter(option =>
    option.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleAddCustom = () => {
    if (searchQuery.trim() && !allOptions.includes(searchQuery.trim())) {
      const newValue = searchQuery.trim();
      setAllOptions([...allOptions, newValue]);
      onChange(newValue);
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim() && filteredOptions.length === 0) {
      handleAddCustom();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        className="w-full flex items-center justify-between px-4 py-3 bg-app-hover text-app-primary rounded-sm hover:bg-app-surface-hover transition-colors border border-app-border"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="text-left">{value || placeholder}</span>
        </div>
        <ChevronDown className={`size-4 text-app-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-app-surface rounded-sm shadow-2xl border border-app-border overflow-hidden">
          <div className="p-2 border-b border-app-border">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search or type custom..."
              className="w-full px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border placeholder-app-tertiary focus:outline-none focus:border-accent-primary"
            />
          </div>

          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-app-hover transition-colors text-left border-b border-app-border last:border-b-0"
                >
                  <span className="text-app-primary">{option}</span>
                  {value === option && <Check className="size-4 text-accent-primary" />}
                </button>
              ))
            ) : searchQuery.trim() ? (
              <button
                type="button"
                onClick={handleAddCustom}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-app-hover transition-colors text-left text-accent-primary"
              >
                <Plus className="size-4" />
                <span>Add "{searchQuery.trim()}"</span>
              </button>
            ) : (
              <div className="px-4 py-3 text-app-tertiary text-center">
                No options found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
