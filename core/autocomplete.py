"""
Autocomplete views for django-autocomplete-light integration.
"""

from django.http import JsonResponse

from dal import autocomplete

from .aggregators.registry import AggregatorRegistry


class FeedIdentifierAutocomplete(autocomplete.Select2ListView):
    """
    Autocomplete view for Feed identifier field.

    Returns identifier choices based on the selected aggregator type.
    Uses forward parameter 'aggregator' to determine which aggregator's
    choices to return.

    Allows custom input via data-tags attribute.
    """

    def get_list(self):
        """
        Get the list of identifier choices for the selected aggregator.

        Returns:
            List of (value, label) tuples for the autocomplete dropdown
        """
        # Get aggregator type from forwarded field
        aggregator_type = self.forwarded.get("aggregator", None)
        current_id = self.forwarded.get("current_id", None)

        if not aggregator_type:
            # No aggregator selected yet, return empty list
            return []

        try:
            # Get aggregator class from registry
            aggregator_class = AggregatorRegistry.get(aggregator_type)

            # Get identifier choices from aggregator
            choices = aggregator_class.get_identifier_choices(query=self.q, user=self.request.user)

            # Add current identifier as an option if it's not already there
            if (
                current_id
                and not any(str(current_id) == str(c[0]) for c in choices)
                and (not self.q or self.q.lower() in str(current_id).lower())
            ):
                # If we had access to the feed instance, we could use get_identifier_label
                # But we only have the ID and aggregator class here.
                # We can try to instantiate a dummy feed if needed, but for now just show ID.
                choices.insert(0, (current_id, current_id))

            # Filter by query if provided
            # Only filter if the aggregator doesn't support dynamic search (i.e. returns all choices)
            if self.q and not aggregator_class.supports_identifier_search:
                choices = [
                    (value, label)
                    for value, label in choices
                    if self.q.lower() in label.lower() or self.q.lower() in value.lower()
                ]

            return choices

        except KeyError:
            # Unknown aggregator type
            return []

    def get(self, request, *args, **kwargs):
        """
        Override get to return proper JSON format with values.

        Select2 expects {id, text} format.
        - id: The actual value to be saved in the database (e.g. UC...)
        - text: The label displayed in the dropdown (e.g. Channel Name)
        """
        choices = self.get_list()

        # Format choices for Select2: [{"id": value, "text": label}, ...]
        results = [{"id": str(value), "text": str(label)} for value, label in choices]

        return JsonResponse({"results": results, "pagination": {"more": False}})
