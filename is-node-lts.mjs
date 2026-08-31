const major = parseInt(process.version.slice(1), 10);
process.exit(major >= 20 && major <= 22 ? 0 : 1);
