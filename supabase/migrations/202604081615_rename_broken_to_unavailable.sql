alter table charger_current_status
rename column broken_since to unavailable_since;

update chargers
set status_normalized_last_scraped = 'unavailable'
where status_normalized_last_scraped = 'broken';

update charger_current_status
set status_normalized = 'unavailable'
where status_normalized = 'broken';

update charger_status_events
set from_status_normalized = 'unavailable'
where from_status_normalized = 'broken';

update charger_status_events
set to_status_normalized = 'unavailable'
where to_status_normalized = 'broken';
