# Aggregators

This directory contains the aggregator implementations for different feed types.

## Overview

The aggregator system follows a modular architecture:

- **Base Aggregator** ([base.py](base.py)) - Abstract base class that all aggregators inherit from
- **Implementations** ([implementations.py](implementations.py)) - Concrete aggregator classes for each feed type
- **Registry** ([registry.py](registry.py)) - Maps feed types to aggregator classes

## Available Aggregators

### Custom Aggregators
- `FullWebsiteAggregator` - Generic web scraper
- `FeedContentAggregator` - RSS/Atom feed parser

### Managed Aggregators (Site-Specific)
- `HeiseAggregator` - Heise news site
- `MerkurAggregator` - Merkur news site
- `TagesschauAggregator` - Tagesschau news site
- `ExplosmAggregator` - Explosm web comics
- `DarkLegacyAggregator` - Dark Legacy Comics
- `CaschysBlogAggregator` - Caschy's Blog
- `MactechnewsAggregator` - MacTechNews
- `OglafAggregator` - Oglaf web comics
- `MeinMmoAggregator` - Mein-MMO gaming site

### Social Aggregators
- `YoutubeAggregator` - YouTube channels
- `RedditAggregator` - Reddit subreddits
- `PodcastAggregator` - Podcast feeds

## Usage

### Using the Service

The `AggregatorService` provides methods to trigger aggregators:

```python
from core.services import AggregatorService

# Trigger a specific feed by ID
result = AggregatorService.trigger_by_feed_id(1)

# Trigger all feeds of a specific type
results = AggregatorService.trigger_by_aggregator_type('youtube')

# Trigger all enabled feeds
results = AggregatorService.trigger_all()

# Trigger with a limit
results = AggregatorService.trigger_all(limit=10)
```

### Using the Management Command

```bash
# Trigger a specific feed
python3 manage.py trigger_aggregator --feed-id 1

# Trigger all feeds of a specific type
python3 manage.py trigger_aggregator --aggregator-type youtube

# Trigger all enabled feeds
python3 manage.py trigger_aggregator --all

# Trigger with a limit
python3 manage.py trigger_aggregator --all --limit 10
```

### Programmatic Usage

```python
from core.models import Feed
from core.aggregators import get_aggregator

# Get a feed
feed = Feed.objects.get(id=1)

# Get the aggregator instance
aggregator = get_aggregator(feed)

# Run aggregation
articles = aggregator.aggregate()
```

## Creating a New Aggregator

To add a new aggregator type:

1. Add the choice to `AGGREGATOR_CHOICES` in [core/choices.py](../choices.py)

2. Create the aggregator class in [implementations.py](implementations.py):

```python
class MyNewAggregator(BaseAggregator):
    """Aggregator for My New Source."""

    def aggregate(self) -> List[Dict[str, Any]]:
        print(f"[MyNewAggregator] Triggered for feed '{self.feed.name}' (ID: {self.feed.id})")
        print(f"  - Identifier: {self.identifier}")
        print(f"  - Daily limit: {self.daily_limit}")

        # TODO: Implement actual aggregation logic
        articles = []

        return articles
```

3. Register it in [registry.py](registry.py):

```python
from .implementations import MyNewAggregator

class AggregatorRegistry:
    _registry: Dict[str, Type[BaseAggregator]] = {
        # ... existing entries ...
        'my_new_source': MyNewAggregator,
    }
```

4. Create a migration if you added a new choice:

```bash
python3 manage.py makemigrations
python3 manage.py migrate
```

## Current Status

All aggregators are currently **dummy implementations** that only print debug information. They need to be ported from the TypeScript implementation in `old/src/server/aggregators/`.

## Next Steps

1. Port aggregator logic from TypeScript to Python
2. Implement actual content fetching and parsing
3. Add error handling and retries
4. Implement article deduplication
5. Add rate limiting
6. Implement caching
7. Add comprehensive tests

## Testing

Run the test script to see all aggregators in action:

```bash
python3 test_aggregators.py
```

This will create test feeds for different aggregator types and trigger them.
